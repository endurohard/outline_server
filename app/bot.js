require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Client } = require('pg'); // Импортируйте клиент PostgreSQL

const token = process.env.TELEGRAM_TOKEN;
const OUTLINE_SERVER = process.env.OUTLINE_API_URL;
const adminId = process.env.ADMIN_ID; // Убедитесь, что в .env указан ваш ID


// Проверка переменных окружения
if (!token) {
    console.error('Ошибка: TELEGRAM_TOKEN не установлен в .env файле.');
    process.exit(1);
}

if (!OUTLINE_SERVER) {
    console.error('Ошибка: OUTLINE_API_URL не установлен в .env файле.');
    process.exit(1);
}

if (!adminId) {
    console.error('Ошибка: ADMIN_ID не установлен в .env файле.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Создание клиента PostgreSQL
const dbClient = new Client({
    host: 'postgres', // Имя сервиса из docker-compose.yml
    user: process.env.DB_USER, // Ваше имя пользователя
    password: process.env.DB_PASSWORD, // Ваш пароль
    database: process.env.DB_NAME, // Название вашей базы данных
    port: 5432,
});

// Подключение к базе данных
dbClient.connect(err => {
    if (err) {
        console.error('Ошибка подключения к PostgreSQL:', err.stack);
    } else {
        console.log('Подключение к PostgreSQL успешно!');
    }
});

// Функция для проверки, является ли пользователь администратором
function isAdmin(userId) {
    return userId.toString() === adminId; // Приводим userId к строке для корректного сравнения
}

// Функция для отображения клавиатуры с кнопками
function showMainKeyboard(chatId) {
    const options = {
        reply_markup: {
            keyboard: [
                [{ text: 'Старт' }],
                [{ text: 'Создать ключ' }, { text: 'Список ключей' }],
                [{ text: 'Список пользователей' }] // Добавление кнопки для админа
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };

    bot.sendMessage(chatId, 'Выберите действие:', options);
}

// Функция для записи клиента в базу данных
async function addClientToDatabase(chatId, username) {
    try {
        console.log(`Запись клиента: ID = ${chatId}, Имя = ${username}`);
        await dbClient.query('INSERT INTO clients (telegram_id, username) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING', [chatId, username]);
        console.log(`Клиент с ID = ${chatId} успешно записан в базу данных.`);
    } catch (error) {
        console.error('Ошибка записи данных в базу:', error);
    }
}

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || ''; // Получение имени пользователя

    // Запись информации о клиенте в базу данных
    await addClientToDatabase(chatId, username);

    showMainKeyboard(chatId);
});

// Обработка нажатия кнопки "Старт"
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    console.log(`Получено сообщение: ${text} от пользователя ID = ${chatId}`);

    if (text === 'Старт') {
        bot.sendMessage(chatId, 'Вы нажали кнопку «Старт». Чем я могу вам помочь?');
        showMainKeyboard(chatId);
    } else if (text === 'Создать ключ') {
        const userId = msg.from.id;
        const dynamicLink = await createNewKey(userId);
        if (dynamicLink) {
            bot.sendMessage(chatId, `Ваша динамическая ссылка: ${dynamicLink}`);
        } else {
            bot.sendMessage(chatId, `Извините, что-то пошло не так.`);
        }
    } else if (text === 'Список ключей') {
        if (isAdmin(chatId)) { // Проверка на админа
            await getKeys(chatId);
        } else {
            bot.sendMessage(chatId, 'У вас нет доступа к этой команде.');
        }
    } else if (text === 'Список пользователей') {
        if (isAdmin(chatId)) { // Проверка на админа
            await getUsers(chatId); // Вызов функции для получения пользователей
        } else {
            bot.sendMessage(chatId, 'У вас нет доступа к этой команде.');
        }
    }
});

// Функция для получения списка пользователей из базы данных
async function getUsers(chatId) {
    try {
        console.log('Запрос списка пользователей из базы данных...');
        const response = await dbClient.query('SELECT telegram_id, username FROM clients');
        const users = response.rows;

        if (users.length === 0) {
            bot.sendMessage(chatId, 'Нет записанных пользователей.');
        } else {
            let usersList = 'Список пользователей:\n';
            users.forEach(user => {
                usersList += `ID: ${user.telegram_id}, Имя: ${user.username || 'не указано'}\n`;
            });
            bot.sendMessage(chatId, usersList);
        }
    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей.');
    }
}

// Функция для создания нового ключа Outline
async function createNewKey(user_id) {
    try {
        const currentDate = new Date();
        const formattedDate = currentDate.toISOString().split('T')[0]; // Формат YYYY-MM-DD

        console.log(`Создание нового ключа для пользователя ID = ${user_id} с датой = ${formattedDate}`);
        const createResponse = await axios.post(`${OUTLINE_SERVER}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        const key_id = createResponse.data.id;

        const keyName = `key_${user_id}_${formattedDate}`; // Используем ID пользователя и дату в качестве имени ключа
        await axios.put(`${OUTLINE_SERVER}/access-keys/${key_id}/name`, { name: keyName }, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        return genOutlineDynamicLink(user_id);
    } catch (error) {
        console.error('Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Функция для генерации динамической ссылки
function genOutlineDynamicLink(user_id) {
    const hexUserId = user_id.toString(16);
    return `${process.env.OUTLINE_USERS_GATEWAY}/conf/${process.env.OUTLINE_SALT}${hexUserId}#${process.env.CONN_NAME}`;
}

// Функция для получения списка ключей доступа
async function getKeys(chatId) {
    try {
        console.log('Запрос списка ключей из API...');
        const response = await axios.get(`${OUTLINE_SERVER}/access-keys`, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        const keys = response.data.accessKeys;

        if (Array.isArray(keys)) {
            if (keys.length === 0) {
                bot.sendMessage(chatId, 'Нет доступных ключей.');
            } else {
                let keysList = 'Список ключей:\n';
                keys.forEach(key => {
                    keysList += `ID: ${key.id}, Порт: ${key.port}, URL: ${key.accessUrl}\n`;
                });
                bot.sendMessage(chatId, keysList);
            }
        } else {
            bot.sendMessage(chatId, 'Ошибка: Ожидался массив ключей, но получен другой формат.\nОтвет от API:\n' + JSON.stringify(keys, null, 2));
        }
    } catch (error) {
        console.error('Ошибка получения ключей:', error.response ? error.response.data : error.message);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
}

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// После определения всех функций и обработчиков
console.log("Бот Запущен...");