require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Client } = require('pg');

// Получение данных из .env
const token = process.env.TELEGRAM_TOKEN;
const adminId = process.env.ADMIN_ID;
const dbConfig = {
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
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

function showMainKeyboard(chatId) {
    const options = {
        reply_markup: {
            keyboard: [
                [{ text: 'Старт' }],
                [{ text: 'Создать ключ' }, { text: 'Список ключей' }],
                [{ text: 'Список пользователей' }]
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

// Функция для запроса нового ключа
async function requestNewKey(userId, chatId) {
    console.log(`Пользователь ID = ${userId} запросил создание нового ключа.`);

    // Уведомление администратору
    const requestId = Date.now(); // Уникальный идентификатор запроса
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

// Функция для обработки callback-запросов
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data.startsWith('confirm_')) {
        const requestId = data.split('_')[1];
        await confirmKeyCreation(requestId);
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Запрос подтвержден.' });
    } else if (data.startsWith('decline_')) {
        const requestId = data.split('_')[1];
        delete pendingKeyRequests[requestId]; // Удаляем запрос после отклонения
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Запрос отклонен.' });
    }
});

// Функция для подтверждения создания ключа
async function confirmKeyCreation(requestId) {
    const request = pendingKeyRequests[requestId];

    if (!request) {
        return "Запрос не найден.";
    }

    const { userId, chatId } = request;
    try {
        const dynamicLink = await createNewKey(userId);
        if (dynamicLink) {
            bot.sendMessage(chatId, `Ваш ключ: ${dynamicLink}`);
            bot.sendMessage(adminId, `Ключ успешно выдан пользователю с ID = ${userId}.`);
        }
        delete pendingKeyRequests[requestId]; // Удаляем запрос после обработки
    } catch (error) {
        console.error("Ошибка при создании ключа:", error);
        bot.sendMessage(chatId, "Не удалось создать ключ. Попробуйте позже.");
    }
}

// Создание нового ключа Outline
async function createNewKey(userId) {
    try {
        console.log(`Создание нового ключа для пользователя ID = ${userId}`);

        // Запрос на создание ключа через API
        const createResponse = await axios.post(`${process.env.OUTLINE_API_URL}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        const keyId = createResponse.data.id; // ID ключа
        const accessUrl = createResponse.data.accessUrl; // Получаем accessUrl из API
        const serverIp = 'bestvpn.world'; // Заменяем IP на ваш фиксированный
        const port = createResponse.data.port; // Используем порт из ответа API

        // Проверяем, что accessUrl не undefined
        if (!accessUrl) {
            console.error('Ошибка: accessUrl не был получен из API.');
            return null;
        }

        // Форматирование динамической ссылки
        const dynamicLink = accessUrl.replace(/@.*?:/, `@${serverIp}:${port}/`) + `#RaphaelVPN`;

        // Сохраните ключ в базу данных с текущей датой
        const currentDate = new Date().toISOString();
        await db.query('INSERT INTO keys (user_id, key_value, creation_date) VALUES ($1, $2, $3)', [userId, dynamicLink, currentDate]);

        console.log(`Динамическая ссылка для пользователя ID = ${userId}: ${dynamicLink}`);
        return dynamicLink;
    } catch (error) {
        console.error('Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Получение списка ключей из базы данных
// Функция для отправки длинных сообщений
async function sendLongMessage(chatId, message) {
    const MAX_MESSAGE_LENGTH = 4096; // Максимальная длина сообщения
    let parts = [];

    // Разбиваем сообщение на части
    while (message.length > MAX_MESSAGE_LENGTH) {
        parts.push(message.substring(0, MAX_MESSAGE_LENGTH));
        message = message.substring(MAX_MESSAGE_LENGTH);
    }

    // Добавляем оставшуюся часть
    if (message) {
        parts.push(message);
    }

    // Отправляем каждую часть по отдельности
    for (const part of parts) {
        await bot.sendMessage(chatId, part);
    }
}

// Получение списка ключей из базы данных
async function getKeysFromDatabase(chatId) {
    console.log(`Запрос списка ключей от администратора ID = ${chatId}`);
    try {
        const res = await db.query('SELECT id, user_id, key_value, creation_date FROM keys');
        console.log(`Получено ${res.rows.length} ключей из базы данных.`);

        let message = 'Список ключей:\n';

        if (res.rows.length > 0) {
            res.rows.forEach(row => {
                message += `ID: ${row.id}, Пользователь ID: ${row.user_id}, Дата: ${row.creation_date}, URL: ${row.key_value}\n`;
            });
        } else {
            message = 'Нет зарегистрированных ключей.';
        }

        // Отправляем сообщение с помощью функции sendLongMessage
        await sendLongMessage(chatId, message);
        console.log(`Отправка списка ключей администратору ID = ${chatId}`);
    } catch (err) {
        console.error('Ошибка получения списка ключей:', err);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
}

// Получение списка пользователей
async function getUsers(chatId) {
    console.log(`Запрос списка пользователей от пользователя ID = ${chatId}`);
    try {
        const res = await db.query('SELECT * FROM clients');
        console.log(`Получено ${res.rows.length} пользователей из базы данных.`);

        let message = 'Список пользователей:\n';

        if (res.rows.length > 0) {
            res.rows.forEach(row => {
                message += `ID: ${row.id}, Имя: ${row.name}\n`;
            });
        } else {
            message = 'Нет зарегистрированных пользователей.';
        }
        bot.sendMessage(chatId, message);
        console.log(`Отправка списка пользователей пользователю ID = ${chatId}`);
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
        showMainKeyboard(chatId);
        await saveClient(userId, userName);
    } else if (text === 'Создать ключ') {
        await requestNewKey(userId, chatId); // Запрашиваем создание ключа
    } else if (text.startsWith('/confirm ')) {
        const requestId = text.split(' ')[1];
        await confirmKeyCreation(requestId); // Подтверждаем создание ключа
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

    // Показываем клавиатуру после любого сообщения
    showMainKeyboard(chatId);
});

// Логирование ошибок опроса
bot.on('polling_error', (error) => {
    console.error('Ошибка опроса:', error);
});