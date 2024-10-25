require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Client } = require('pg');

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
    .catch(err => console.error("Ошибка подключения к PostgreSQL:", err));

if (!token || !adminId) {
    console.error('Ошибка: не установлены TELEGRAM_TOKEN или ADMIN_ID в .env файле.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log("Бот Запущен...");

// Хранилище для запросов на создание ключей
let pendingKeyRequests = {};

// ==================== Функции ====================

function isAdmin(userId) {
    return userId.toString() === adminId;
}

function showMainKeyboard(chatId, isAdminUser) {
    const options = isAdminUser
        ? {
            reply_markup: {
                keyboard: [
                    [{ text: 'Старт' }],
                    [{ text: 'Создать ключ' }, { text: 'Список ключей' }],
                    [{ text: 'Список пользователей' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        }
        : {
            reply_markup: {
                keyboard: [
                    [{ text: 'Запросить ключ' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        };

    bot.sendMessage(chatId, 'Выберите действие:', options);
}

async function saveClient(userId, userName) {
    try {
        await db.query(
            'INSERT INTO clients (telegram_id, name) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
            [userId, userName]
        );
        console.log(`Клиент с ID = ${userId} успешно записан в базу данных.`);
    } catch (err) {
        console.error(`Ошибка записи клиента с ID = ${userId}:`, err);
    }
}

async function requestNewKey(userId, chatId) {
    console.log(`Пользователь ID = ${userId} запросил создание нового ключа.`);
    const requestId = Date.now();
    pendingKeyRequests[requestId] = { userId, chatId };

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Подтвердить', callback_data: `confirm_${requestId}` },
                    { text: 'Отклонить', callback_data: `decline_${requestId}` }
                ]
            ]
        }
    };

    bot.sendMessage(adminId, `Пользователь с ID = ${userId} запросил создание ключа.\nПодтвердите, чтобы создать ключ.`, options);
}

bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    if (data.startsWith('confirm_')) {
        const requestId = data.split('_')[1];
        await confirmKeyCreation(requestId);
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Запрос подтвержден.' });
    } else if (data.startsWith('decline_')) {
        const requestId = data.split('_')[1];
        delete pendingKeyRequests[requestId];
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Запрос отклонен.' });
    }
});

async function confirmKeyCreation(requestId) {
    const request = pendingKeyRequests[requestId];
    if (!request) return "Запрос не найден.";
    const { userId, chatId } = request;

    try {
        const dynamicLink = await createNewKey(userId);
        if (dynamicLink) {
            bot.sendMessage(chatId, `Ваш ключ: ${dynamicLink}`);
            bot.sendMessage(adminId, `Ключ успешно выдан пользователю с ID = ${userId}.`);
        }
        delete pendingKeyRequests[requestId];
    } catch (error) {
        console.error("Ошибка при создании ключа:", error);
        bot.sendMessage(chatId, "Не удалось создать ключ. Попробуйте позже.");
    }
}

// Создание нового ключа Outline с добавлением имени
async function createNewKey(userId) {
    try {
        console.log(`Создание нового ключа для пользователя ID = ${userId}`);
        const createResponse = await axios.post(`${process.env.OUTLINE_API_URL}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        const keyId = createResponse.data.id;
        const accessUrl = createResponse.data.accessUrl;
        const serverIp = 'bestvpn.world';
        const port = createResponse.data.port;

        if (!accessUrl) {
            console.error('Ошибка: accessUrl не был получен из API.');
            return null;
        }

        const currentDate = new Date();
        const keyName = `User_${userId}_${currentDate.toISOString().slice(0, 10)}`;
        await axios.put(
            `${process.env.OUTLINE_API_URL}/access-keys/${keyId}/name`,
            { name: keyName },
            { headers: { 'Content-Type': 'application/json' }, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
        );

        const dynamicLink = accessUrl.replace(/@.*?:/, `@${serverIp}:${port}/`) + `#RaphaelVPN`;

        await db.query('INSERT INTO keys (user_id, key_value, creation_date) VALUES ($1, $2, $3)', [userId, dynamicLink, currentDate.toISOString()]);
        console.log(`Динамическая ссылка для пользователя ID = ${userId}: ${dynamicLink}`);
        return dynamicLink;
    } catch (error) {
        console.error('Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Функция для отправки длинных сообщений
async function sendLongMessage(chatId, message) {
    const MAX_MESSAGE_LENGTH = 4096;
    let parts = [];
    while (message.length > MAX_MESSAGE_LENGTH) {
        parts.push(message.substring(0, MAX_MESSAGE_LENGTH));
        message = message.substring(MAX_MESSAGE_LENGTH);
    }
    if (message) parts.push(message);
    for (const part of parts) {
        await bot.sendMessage(chatId, part);
    }
}

async function getKeysFromDatabase(chatId) {
    console.log(`Запрос списка ключей от администратора ID = ${chatId}`);
    try {
        const res = await db.query('SELECT id, user_id, key_value, creation_date FROM keys');
        let message = 'Список ключей:\n';

        if (res.rows.length > 0) {
            res.rows.forEach(row => {
                message += `ID: ${row.id}, Пользователь ID: ${row.user_id}, Дата: ${row.creation_date}, URL: ${row.key_value}\n`;
            });
        } else {
            message = 'Нет зарегистрированных ключей.';
        }
        await sendLongMessage(chatId, message);
    } catch (err) {
        console.error('Ошибка получения списка ключей:', err);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
}

async function getUsers(chatId) {
    try {
        const res = await db.query('SELECT * FROM clients');
        let message = 'Список пользователей:\n';
        if (res.rows.length > 0) {
            res.rows.forEach(row => {
                message += `ID: ${row.id}, Имя: ${row.name}\n`;
            });
        } else {
            message = 'Нет зарегистрированных пользователей.';
        }
        bot.sendMessage(chatId, message);
    } catch (err) {
        console.error('Ошибка получения списка пользователей:', err);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей.');
    }
}

// ==================== Обработчики сообщений ====================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.username || msg.from.first_name || "Неизвестный";
    const text = msg.text;

    console.log(`Получено сообщение: ${text} от пользователя ID = ${chatId}`);

    if (text === 'Старт') {
        bot.sendMessage(chatId, 'Вы нажали кнопку «Старт». Чем я могу вам помочь?');
        showMainKeyboard(chatId, isAdmin(userId));
        await saveClient(userId, userName);
    } else if (text === 'Создать ключ' || text === 'Запросить ключ') {
        await requestNewKey(userId, chatId);
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
    showMainKeyboard(chatId, isAdmin(userId));
});

bot.on('polling_error', (error) => console.error('Ошибка опроса:', error));
