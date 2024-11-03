require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const { saveClient } = require('../functions/clientFunctions');
const { createAndSendKey } = require('../functions/keyFunctions');
const { getUsersWithKeys, getUsers, requestPaymentDetails, handleAdminPaymentMessage } = require('../functions/adminFunctions');
const getServersFromEnv = require('../functions/generateServers');
const getKeysFromDatabase = require('../functions/getKeysFromDatabase');
const sendLongMessage = require('../functions/sendLongMessage');
const showMainKeyboard = require('../functions/showMainKeyboard');

const token = process.env.TELEGRAM_TOKEN;
const adminId = process.env.ADMIN_ID?.toString();
const db = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_NAME,
});

const bot = new TelegramBot(token, { polling: true });
console.log("[Bot] Бот запущен...");

const servers = getServersFromEnv();
const lastCommand = {};
const pendingKeyRequests = {};
const pendingPaymentRequests = {};

// Определение функции sendSafeMessage
async function sendSafeMessage(bot, chatId, text, options = {}) {
    if (text && text.trim()) {
        await bot.sendMessage(chatId, text, options);
    }
}

// Обработчик команд
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const command = msg.text?.trim().toLowerCase();
    const isAdminUser = userId.toString() === adminId;

    console.log(`[onMessage] Получена команда: ${command} от пользователя ID ${userId}`);

    try {
        if (isAdminUser && command === 'создать ключ') {
            console.log(`[onMessage] Выполняется команда 'создать ключ'`);

            // Формируем кнопки для выбора сервера
            const buttons = servers.map(server => [{ text: server.name, callback_data: `select_server_${server.id}` }]);
            await bot.sendMessage(chatId, 'Выберите сервер для создания ключа:', {
                reply_markup: { inline_keyboard: buttons }
            });
            pendingKeyRequests[userId] = { chatId }; // Сохраняем запрос
        }
    } catch (error) {
        console.error(`[onMessage] Ошибка: ${error}`);
        await sendSafeMessage(bot, chatId, "Произошла ошибка. Попробуйте позже.");
    }
});

// Обработчик callback_query для выбора сервера и создания ключа
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;

    if (data.startsWith('select_server_')) {
        const serverId = parseInt(data.split('_').pop(), 10);
        const selectedServer = servers.find(server => server.id === serverId);

        if (selectedServer && pendingKeyRequests[userId]) {
            console.log(`[callback_query] Пользователь выбрал сервер ${selectedServer.name} для создания ключа`);

            // Удаляем запись из pendingKeyRequests и запускаем процесс создания ключа
            delete pendingKeyRequests[userId];
            await createAndSendKey(bot, userId, chatId, serverId, selectedServer.apiUrl, selectedServer.name, selectedServer.name.toLowerCase());
        } else {
            await bot.sendMessage(chatId, 'Ошибка при выборе сервера. Попробуйте снова.');
        }

        await bot.answerCallbackQuery(callbackQuery.id);
    }
});