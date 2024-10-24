require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Получение токена из переменных окружения
const token = process.env.TELEGRAM_TOKEN;

if (!token) {
    console.error('Ошибка: TELEGRAM_TOKEN не установлен в .env файле.');
    process.exit(1); // Завершение процесса с ошибкой
}

const bot = new TelegramBot(token, { polling: true });

// Конфигурация Outline сервера
const OUTLINE_SERVER = process.env.OUTLINE_API_URL; // Используем URL из переменной окружения
const OUTLINE_API = '/access-keys';
const OUTLINE_USERS_GATEWAY = process.env.OUTLINE_USERS_GATEWAY || 'ssconf://bestvpn.world';
const OUTLINE_SALT = process.env.OUTLINE_SALT || '50842';
const CONN_NAME = process.env.CONN_NAME || 'RaphaelVPN';

// Функция для отображения клавиатуры с кнопками
function showMainKeyboard(chatId) {
    const options = {
        reply_markup: {
            keyboard: [
                [{ text: 'Старт' }],
                [{ text: 'Создать ключ' }, { text: 'Список ключей' }]
            ],
            resize_keyboard: true, // Подгонка размера клавиатуры под экран
            one_time_keyboard: true // Клавиатура исчезнет после нажатия
        }
    };

    bot.sendMessage(chatId, 'Выберите действие:', options);
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    showMainKeyboard(chatId); // Отправляем клавиатуру при старте
});

// Обработка нажатия кнопки "Старт"
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === 'Старт') {
        bot.sendMessage(chatId, 'Вы нажали кнопку «Старт». Чем я могу вам помочь?');
        showMainKeyboard(chatId); // Показать главную клавиатуру
    } else if (text === 'Создать ключ') {
        const userId = msg.from.id;
        const dynamicLink = await createNewKey(userId);
        if (dynamicLink) {
            bot.sendMessage(chatId, `Ваша динамическая ссылка: ${dynamicLink}`);
        } else {
            bot.sendMessage(chatId, `Извините, что-то пошло не так.`);
        }
    } else if (text === 'Список ключей') {
        await getKeys(chatId);
    }
});

// Функция для создания нового ключа Outline
async function createNewKey(user_id) {
    try {
        const createResponse = await axios.post(`${OUTLINE_SERVER}${OUTLINE_API}`, {}, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) // Игнорируем ошибки сертификатов
        });
        const key_id = createResponse.data.id;

        const keyName = `key_${user_id}`;
        await axios.put(`${OUTLINE_SERVER}${OUTLINE_API}/${key_id}/name`, { name: keyName }, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        return genOutlineDynamicLink(user_id);
    } catch (error) {
        console.error('Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        return null; // Завершить функцию при ошибке
    }
}

// Функция для генерации динамической ссылки
function genOutlineDynamicLink(user_id) {
    const hexUserId = user_id.toString(16);
    return `${OUTLINE_USERS_GATEWAY}/conf/${OUTLINE_SALT}${hexUserId}#${CONN_NAME}`;
}

// Функция для получения списка ключей доступа
async function getKeys(chatId) {
    try {
        const response = await axios.get(`${OUTLINE_SERVER}${OUTLINE_API}`, {
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