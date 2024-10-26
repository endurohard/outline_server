require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('pg'); // Импортируем клиент PostgreSQL
const { getUsersWithKeys } = require('../functions/adminFunctions');
const { saveClient } = require('../functions/clientFunctions');
const { createNewKey, requestNewKey } = require('../functions/keyFunctions'); // Импортируйте обе функции
const { showMainKeyboard } = require('../functions/utils');

// Получение данных из .env
const token = process.env.TELEGRAM_TOKEN;
const adminId = process.env.ADMIN_ID;
const dbConfig = {
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_NAME,
};

// Подключение к PostgreSQL
const db = new Client(dbConfig);
db.connect()
    .then(() => console.log("Подключение к PostgreSQL успешно!"))
    .catch(err => {
        console.error("Ошибка подключения к PostgreSQL:", err);
        process.exit(1); // Завершение процесса в случае ошибки подключения
    });

// Проверка на наличие токена и adminId
if (!token || !adminId) {
    console.error('Ошибка: не установлены TELEGRAM_TOKEN или ADMIN_ID в .env файле.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log("Бот Запущен...");

let pendingKeyRequests = {};

// ==================== Функции ====================

function isAdmin(userId) {
    return userId.toString() === adminId;
}

// ==================== Обработчики сообщений ====================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;  // ID чата
    const userId = msg.from.id;   // ID пользователя
    const userName = msg.from.username || msg.from.first_name || "Неизвестный"; // Имя пользователя
    const text = msg.text;         // Полученный текст сообщения

    console.log(`Получено сообщение: "${text}" от пользователя ID = ${userId}, чат ID = ${chatId}`);

    // Обработка команд
    try {
        if (text === 'Старт') {
            bot.sendMessage(chatId, 'Вы нажали кнопку «Старт». Чем я могу вам помочь?');
            showMainKeyboard(bot, chatId, isAdmin(userId));
            await saveClient(userId, userName);
        } else if (text === 'Создать ключ' || text === 'Запросить ключ') {
            await requestNewKey(userId, chatId, userName); // Вызов функции запроса нового ключа
        } else if (text === 'Список пользователей с ключами') {
            if (isAdmin(chatId)) {
                await getUsersWithKeys(chatId);
            } else {
                bot.sendMessage(chatId, 'У вас нет доступа к этой команде.');
            }
        } else if (text.startsWith('/confirm ')) {
            const requestId = text.split(' ')[1];
            await confirmKeyCreation(requestId);
        } else if (text === 'Список ключей') {
            if (isAdmin(chatId)) {
                await getKeysFromDatabase(chatId);
            } else {
                bot.sendMessage(chatId, 'У вас нет доступа к этой команде.');
            }
        } else if (text === 'Список пользователей') {
            if (isAdmin(chatId)) {
                await getUsers(chatId);
            } else {
                bot.sendMessage(chatId, 'У вас нет доступа к этой команде.');
            }
        }

        showMainKeyboard(bot, chatId, isAdmin(userId));
    } catch (error) {
        console.error("Ошибка обработки сообщения:", error);
        bot.sendMessage(chatId, "Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже.");
    }
});

// Обработка ошибок опроса
bot.on('polling_error', (error) => console.error('Ошибка опроса:', error));