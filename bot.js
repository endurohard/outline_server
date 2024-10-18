require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Настройка бота Telegram
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// API URL для сервера Outline
const OUTLINE_API_URL = process.env.OUTLINE_API_URL;

// Команда /start с кнопками
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    const options = {
        reply_markup: {
            keyboard: [
                [{ text: '/create_key' }, { text: '/keys' }]
            ],
            resize_keyboard: true, // Делаем кнопки адаптируемыми по размеру
            one_time_keyboard: false // Оставляем клавиатуру активной
        }
    };

    bot.sendMessage(chatId, 'Привет! Я бот для управления ключами Outline. Используйте кнопки ниже для создания или просмотра ключей.', options);
});

// Команда для получения списка ключей доступа
bot.onText(/\/keys/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        // Получаем список ключей доступа
        const response = await axios.get(`${OUTLINE_API_URL}/access-keys`, { httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) });
        const keys = response.data;

        if (keys.length === 0) {
            bot.sendMessage(chatId, 'Нет доступных ключей.');
        } else {
            let keysList = 'Список ключей:\n';
            keys.forEach(key => {
                keysList += `ID: ${key.id}, Порт: ${key.port}, URL: ${key.accessUrl}\n`;
            });
            bot.sendMessage(chatId, keysList);
        }
    } catch (error) {
        console.error('Ошибка получения ключей:', error);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
});

// Команда для создания нового ключа доступа
bot.onText(/\/create_key/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        // Создаем новый ключ доступа
        const response = await axios.post(`${OUTLINE_API_URL}/access-keys`, {}, { httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) });
        const newKey = response.data;

        const message = `Создан новый ключ:\nID: ${newKey.id}, Порт: ${newKey.port}, URL: ${newKey.accessUrl}`;
        bot.sendMessage(chatId, message);
    } catch (error) {
        console.error('Ошибка создания ключа:', error);
        bot.sendMessage(chatId, 'Произошла ошибка при создании ключа.');
    }
});
