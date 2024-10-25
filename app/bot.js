require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Client } = require('pg');

// Получение данных из .env
const token = process.env.TELEGRAM_TOKEN;
const adminId = process.env.ADMIN_ID;
const dbConfig = {
    host: process.env.DB_HOST || 'postgres', // Хост базы данных
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

// ==================== Хранилище для запросов на создание ключей ====================
let pendingKeyRequests = {}; // Объект для хранения ожидающих подтверждения запросов

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

async function createNewKey(userId) {
    // Запись запроса на создание ключа в временное хранилище
    pendingKeyRequests[userId] = { status: 'pending' };

    // Уведомление администратора о новом запросе
    bot.sendMessage(adminId, `Пользователь с ID = ${userId} запросил создание ключа. Подтвердите, чтобы создать ключ.`, {
        reply_markup: {
            inline_keyboard: [[
                { text: 'Подтвердить создание ключа', callback_data: `confirm_key_${userId}` }
            ]]
        }
    });

    console.log(`Запрос на создание ключа от пользователя ID = ${userId} ожидает подтверждения.`);
}

// Подтверждение создания ключа
async function confirmKeyCreation(userId) {
    try {
        console.log(`Создание нового ключа для пользователя ID = ${userId}`);

        // Создание ключа в Outline API
        const createResponse = await axios.post(`${process.env.OUTLINE_API_URL}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        const keyId = createResponse.data.id; // ID ключа
        const accessUrl = createResponse.data.accessUrl; // Получаем accessUrl из API
        const serverIp = 'bestvpn.world'; // Заменяем IP на ваш фиксированный
        const port = createResponse.data.port; // Используем порт из ответа API

        if (!accessUrl) {
            console.error('Ошибка: accessUrl не был получен из API.');
            return null;
        }

        const dynamicLink = accessUrl.replace(/@.*?:/, `@${serverIp}:${port}/`) + `#RaphaelVPN`;
        const currentDate = new Date().toISOString();
        await db.query('INSERT INTO keys (user_id, key_value, creation_date) VALUES ($1, $2, $3)', [userId, dynamicLink, currentDate]);

        console.log(`Динамическая ссылка для пользователя ID = ${userId}: ${dynamicLink}`);
        return dynamicLink;
    } catch (error) {
        console.error('Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        return null;
    }
}

// ==================== Обработчики команд ====================

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
        await createNewKey(userId); // Запрашиваем создание ключа
        bot.sendMessage(chatId, 'Ваш запрос на создание ключа отправлен администратору на подтверждение.');
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

// Обработка запросов на подтверждение ключа
bot.on('callback_query', async (callbackQuery) => {
    const userId = callbackQuery.data.split('_')[2]; // Извлекаем ID пользователя из callback_data
    const chatId = callbackQuery.from.id; // ID администратора

    if (callbackQuery.data.startsWith('confirm_key_') && isAdmin(chatId)) {
        const dynamicLink = await confirmKeyCreation(userId);
        if (dynamicLink) {
            bot.sendMessage(userId, `Ваш ключ создан: ${dynamicLink}`);
        } else {
            bot.sendMessage(userId, 'Извините, что-то пошло не так при создании ключа.');
        }
    } else {
        bot.sendMessage(chatId, 'У вас нет доступа к этой команде.');
    }
});

// Логирование ошибок опроса
bot.on('polling_error', (error) => {
    console.error('Ошибка опроса:', error);
});