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
        await db.query(
            'INSERT INTO clients (telegram_id, name) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
            [userId, userName]
        );
        console.log(`Клиент с ID = ${userId} успешно записан в базу данных.`);
    } catch (err) {
        console.error(`Ошибка записи клиента с ID = ${userId}:`, err);
    }
}

// Создание нового ключа Outline
async function createNewKey(userId) {
    try {
        console.log(`Создание нового ключа для пользователя ID = ${userId}`);

        // Ваш код для создания ключа здесь (необходимо дополнить)

        const currentDate = new Date();
        const options = {
            timeZone: 'Europe/Moscow',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        };
        const formattedDate = currentDate.toLocaleString('ru-RU', options);

        // Сохраните ключ, ID пользователя и дату в базу данных
        await db.query('INSERT INTO keys (user_id, creation_date) VALUES ($1, $2)', [userId, formattedDate]);

        console.log(`Ключ для пользователя ID = ${userId} успешно сохранен с датой ${formattedDate}.`);
        // Вернуть динамическую ссылку или дальнейшая логика
    } catch (error) {
        console.error('Ошибка при создании нового ключа Outline:', error);
        return null;
    }
}

// Получение списка ключей из базы данных
async function getKeysFromDatabase(chatId) {
    console.log(`Запрос списка ключей от администратора ID = ${chatId}`);
    try {
        const res = await db.query('SELECT id, user_id, key_value, created_at FROM keys');
        console.log(`Получено ${res.rows.length} ключей из базы данных.`);

        let message = 'Список ключей:\n';

        if (res.rows.length > 0) {
            res.rows.forEach(row => {
                message += `ID: ${row.id}, Пользователь ID: ${row.user_id}, Дата: ${row.created_at}, URL: ${row.key_value}\n`;
            });
        } else {
            message = 'Нет зарегистрированных ключей.';
        }
        bot.sendMessage(chatId, message);
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

// Обработчик команд
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
        const dynamicLink = await createNewKey(userId);
        if (dynamicLink) {
            bot.sendMessage(chatId, `Ваша динамическая ссылка: ${dynamicLink}`);
        } else {
            bot.sendMessage(chatId, 'Извините, что-то пошло не так.');
        }
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