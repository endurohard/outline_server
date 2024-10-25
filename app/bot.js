require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Client } = require('pg');

// Получение данных из .env
const token = process.env.TELEGRAM_TOKEN;
const adminId = process.env.ADMIN_ID;
const dbConfig = {
    host: process.env.DB_HOST || 'postgres', // Изменено здесь
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

// Проверка, является ли пользователь администратором
function isAdmin(userId) {
    const result = userId.toString() === adminId;
    console.log(`Проверка администратора: userId = ${userId}, adminId = ${adminId}, результат = ${result}`);
    return result;
}

// Отображение главной клавиатуры
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
    console.log(`Отправка клавиатуры с командами для пользователя ID = ${chatId}`);
}

// Функция для записи клиента в базу данных
async function saveClient(userId, userName) {
    console.log(`Запись клиента: ID = ${userId}, Имя = ${userName}`);
    try {
        const res = await db.query('SELECT id FROM clients WHERE id = $1', [userId]);
        if (res.rows.length === 0) {
            await db.query('INSERT INTO clients (id, name) VALUES ($1, $2)', [userId, userName]);
            console.log(`Клиент с ID = ${userId} успешно записан в базу данных.`);
        } else {
            console.log(`Клиент с ID = ${userId} уже существует в базе данных.`);
        }
    } catch (err) {
        console.error(`Ошибка записи клиента с ID = ${userId}:`, err);
    }
}

// Создание нового ключа Outline
async function createNewKey(userId) {
    try {
        console.log(`Создание нового ключа для пользователя ID = ${userId}`);
        const createResponse = await axios.post(`${process.env.OUTLINE_API_URL}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        const keyId = createResponse.data.id;
        const keyName = `key_${userId}_${new Date().toISOString().split('T')[0]}`;

        await axios.put(`${process.env.OUTLINE_API_URL}/access-keys/${keyId}/name`, { name: keyName }, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        const dynamicLink = `${process.env.OUTLINE_USERS_GATEWAY}/conf/${process.env.OUTLINE_SALT}${userId.toString(16)}#${process.env.CONN_NAME}`;
        console.log(`Динамическая ссылка для пользователя ID = ${userId}: ${dynamicLink}`);
        return dynamicLink;
    } catch (error) {
        console.error('Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Получение списка ключей
async function getKeys(chatId) {
    console.log(`Запрос списка ключей от пользователя ID = ${chatId}`);
    try {
        const response = await axios.get(`${process.env.OUTLINE_API_URL}/access-keys`, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        const keys = response.data.accessKeys;
        let message = 'Список ключей:\n';

        if (Array.isArray(keys) && keys.length > 0) {
            keys.forEach(key => {
                message += `ID: ${key.id}, Порт: ${key.port}, URL: ${key.accessUrl}\n`;
            });
        } else {
            message = 'Нет доступных ключей.';
        }
        bot.sendMessage(chatId, message);
    } catch (error) {
        console.error('Ошибка получения ключей:', error.response ? error.response.data : error.message);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
}

// Получение списка пользователей
async function getUsers(chatId) {
    console.log(`Запрос списка пользователей от пользователя ID = ${chatId}`);
    try {
        const res = await db.query('SELECT * FROM clients'); // Запрос к базе данных для получения пользователей
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

// Обработчик команд
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.username || msg.from.first_name || "Неизвестный";
    const text = msg.text;

    console.log(`Получено сообщение: ${text} от пользователя ID = ${chatId}`);

    // Сохранение клиента при старте
    if (text === 'Старт') {
        await saveClient(userId, userName);
        bot.sendMessage(chatId, 'Вы нажали кнопку «Старт». Чем я могу вам помочь?');
        showMainKeyboard(chatId);
    } else if (text === 'Создать ключ') {
        const dynamicLink = await createNewKey(userId);
        if (dynamicLink) {
            bot.sendMessage(chatId, `Ваша динамическая ссылка: ${dynamicLink}`);
        } else {
            bot.sendMessage(chatId, 'Извините, что-то пошло не так.');
        }
    } else if (text === 'Список ключей') {
        if (isAdmin(chatId)) {
            await getKeys(chatId);
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
});

// Логирование ошибок опроса
bot.on('polling_error', (error) => {
    console.error('Ошибка опроса:', error);
});