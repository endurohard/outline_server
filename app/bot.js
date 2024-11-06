require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const { saveClient } = require('../functions/clientFunctions');
const { createAndSendKey } = require('../functions/keyFunctions');
const { getUsersWithKeys, getUsers, requestPaymentDetails, handleAdminPaymentMessage } = require('../functions/adminFunctions');
const getServersFromEnv = require('../functions/generateServers');
const { monitorServers } = require('../functions/serverMonitor');
const getKeysFromDatabase = require('../functions/getKeysFromDatabase');
const sendLongMessage = require('../functions/sendLongMessage');
const showMainKeyboard = require('../functions/showMainKeyboard');
const { availableServers } = require('../functions/serverMonitor');


const token = process.env.TELEGRAM_TOKEN;
const adminId = process.env.ADMIN_ID?.toString();

console.log(`[1] Администраторский ID загружен: ${adminId}`);

const db = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_NAME,
});

const bot = new TelegramBot(token, { polling: true });
console.log("[2] Бот запущен...");

// Запуск мониторинга серверов
monitorServers(bot, adminId);

const lastCommand = {};
const pendingKeyRequests = {};
const pendingPaymentRequests = {};

// Отправка списка доступных серверов
async function showServerSelection(bot, chatId) {
    console.log(`[3] Вызов showServerSelection для пользователя ID ${chatId}`);
    console.log(`[Debug] Доступные серверы перед отправкой: ${JSON.stringify(availableServers)}`);

    if (availableServers.length === 0) {
        await bot.sendMessage(chatId, 'К сожалению, в данный момент нет доступных серверов. Пожалуйста, попробуйте позже.');
        return;
    }

    const buttons = availableServers.map(server => [
        { text: server.name, callback_data: `select_server_${server.name}` }
    ]);

    await bot.sendMessage(chatId, 'Выберите сервер для создания ключа:', {
        reply_markup: { inline_keyboard: buttons }
    });

    console.log(`[4] Список серверов отправлен пользователю ID ${chatId}`);
}

// Обработчик сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isAdminUser = userId.toString() === adminId;
    let command = msg.text ? msg.text.trim().toLowerCase() : null;

    console.log(`[5] Получена команда: ${command || 'не команда'} от пользователя ID ${userId}`);

    try {
        if (msg.photo) {
            console.log(`[50] Получена квитанция (фото) от пользователя ID ${userId}`);
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            await bot.sendPhoto(adminId, fileId, {
                caption: `Клиент ID ${userId} отправил квитанцию об оплате.`
            });
            await bot.sendMessage(adminId, `Подтвердите или отклоните платеж для клиента ID ${userId}:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Подтвердить оплату', callback_data: `approve_payment_${userId}` }],
                        [{ text: 'Отклонить оплату', callback_data: `decline_payment_${userId}` }]
                    ]
                }
            });
            return;
        }

        if (msg.document) {
            console.log(`[52] Получен документ от пользователя ID ${userId}`);
            const fileId = msg.document.file_id;
            await bot.sendDocument(adminId, fileId, {
                caption: `Клиент ID ${userId} отправил документ об оплате.`
            });
            await bot.sendMessage(adminId, `Подтвердите или отклоните платеж для клиента ID ${userId}:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Подтвердить оплату', callback_data: `approve_payment_${userId}` }],
                        [{ text: 'Отклонить оплату', callback_data: `decline_payment_${userId}` }]
                    ]
                }
            });
            return;
        }

        if (command === '/start' || command === '/menu') {
            await bot.sendMessage(chatId, 'Добро пожаловать! Чем могу помочь?');
            showMainKeyboard(bot, chatId, isAdminUser);
            await saveClient(userId, msg.from.username || msg.from.first_name || 'Неизвестный');
        } else if (isAdminUser && command.startsWith('альфа-банк')) {
            const requestKey = Object.keys(pendingPaymentRequests).find(key => key.startsWith(`${adminId}_`));
            const paymentRequest = pendingPaymentRequests[requestKey];

            if (paymentRequest) {
                const clientChatId = paymentRequest.clientChatId;
                await bot.sendMessage(clientChatId, `Необходимо оплатить: ${command}`, {
                    reply_markup: {
                        inline_keyboard: [[{ text: 'Оплатил', callback_data: `payment_confirmed_${clientChatId}` }]]
                    }
                });
                delete pendingPaymentRequests[requestKey];
            } else {
                await bot.sendMessage(chatId, 'Нет активных запросов на оплату.');
            }
        } else if (command === 'запросить ключ') {
            await monitorServers(bot, adminId); // Мониторинг обновит availableServers
            await showServerSelection(bot, chatId, availableServers); // Передаем актуальный список доступных серверов
        } else {
            await bot.sendMessage(chatId, "Команда не распознана. Пожалуйста, отправьте команду или квитанцию.");
        }
    } catch (error) {
        console.error(`[Error] Ошибка обработки команды:`, error);
        await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
});

// Обработчик callback_query
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    console.log(`[17] Обработка callback_query: ${data}`);

    if (data.startsWith('select_server_')) {
        const serverName = data.split('select_server_')[1];
        const selectedServer = availableServers.find(server => server.name === serverName);

        if (!selectedServer) {
            await bot.sendMessage(userId, 'Ошибка при выборе сервера. Попробуйте снова.');
            return;
        }

        pendingKeyRequests[userId] = { server: selectedServer };
        await requestPaymentDetails(bot, adminId, userId, callbackQuery.from.username || `ID ${userId}`, pendingPaymentRequests);
    } else if (data.startsWith('payment_confirmed_')) {
        const clientChatId = data.split('payment_confirmed_')[1];
        await bot.sendMessage(clientChatId, "Отправьте фото или документ квитанции для подтверждения оплаты.");
    } else if (data.startsWith('approve_payment_')) {
        const clientChatId = data.split('approve_payment_')[1];
        const { server } = pendingKeyRequests[clientChatId] || {};

        if (!server) {
            await bot.sendMessage(adminId, 'Ошибка: данные для создания ключа не найдены.');
            return;
        }

        try {
            await createAndSendKey(bot, clientChatId, clientChatId, server.name, server.apiUrl, server.name, adminId);
            await bot.sendMessage(clientChatId, "Ваш платеж подтвержден. Ключ успешно создан.");
            await bot.sendMessage(adminId, `Ключ для пользователя ID ${clientChatId} успешно создан.`);
        } catch (error) {
            console.error(`[Error] Ошибка создания ключа для клиента ID ${clientChatId}:`, error);
        }
    } else if (data.startsWith('decline_payment_')) {
        const clientChatId = data.split('decline_payment_')[1];
        delete pendingKeyRequests[clientChatId];
        await bot.sendMessage(clientChatId, 'Ваш платеж был отклонен. Пожалуйста, свяжитесь с администратором для уточнения.');
        await bot.sendMessage(adminId, `Платеж клиента ID ${clientChatId} отклонен.`);
    }
});