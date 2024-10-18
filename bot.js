// Загрузка переменных окружения из .env
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
const OUTLINE_SERVER = 'https://node1.users.outline.yourvpn.io';
const OUTLINE_API = '/access-keys';
const OUTLINE_USERS_GATEWAY = 'ssconf://users.outline.yourvpn.io';
const OUTLINE_SALT = 'qwerty123';
const CONN_NAME = 'Wow!';

// Функция для создания нового ключа Outline
async function createNewKey(user_id) {
    try {
        // Шаг 1: Создание ключа
        const createResponse = await axios.post(`${OUTLINE_SERVER}${OUTLINE_API}`, {}, {
            headers: { 'Content-Type': 'application/json' },
            // Добавьте необходимые заголовки аутентификации, если требуется
        });
        const key_id = createResponse.data.id;

        // Шаг 2: Переименование ключа для привязки к Telegram пользователю
        const keyName = `key_${user_id}`;
        await axios.put(`${OUTLINE_SERVER}${OUTLINE_API}/${key_id}/name`, { name: keyName }, {
            headers: { 'Content-Type': 'application/json' },
            // Добавьте необходимые заголовки аутентификации, если требуется
        });

        // Шаг 3: Генерация динамической ссылки
        const dynamicLink = genOutlineDynamicLink(user_id);

        return dynamicLink;
    } catch (error) {
        console.error('Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Функция для генерации динамической ссылки
function genOutlineDynamicLink(user_id) {
    // Преобразование user_id в шестнадцатеричную строку
    const hexUserId = user_id.toString(16);
    return `${OUTLINE_USERS_GATEWAY}/conf/${OUTLINE_SALT}${hexUserId}#${CONN_NAME}`;
}

// Обработка команды бота для генерации ключа
bot.onText(/\/generate_key/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Генерация нового ключа для пользователя
    const dynamicLink = await createNewKey(userId);

    // Отправка динамической ссылки пользователю
    if (dynamicLink) {
        bot.sendMessage(chatId, `Ваша динамическая ссылка: ${dynamicLink}`);
    } else {
        bot.sendMessage(chatId, `Извините, что-то пошло не так.`);
    }
});

// Команда для получения списка ключей доступа
bot.onText(/\/keys/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        // Получаем список ключей доступа с сервера Outline
        const response = await axios.get(`${OUTLINE_SERVER}${OUTLINE_API}`, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        // Проверка, что возвращает сервер
        console.log('Ответ от сервера:', response.data);

        const keys = response.data;

        // Проверка, является ли 'keys' массивом
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
            // Если ключи не в виде массива, выводим JSON
            bot.sendMessage(chatId, 'Ошибка: Ожидался массив ключей, но получен другой формат.\nОтвет от API:\n' + JSON.stringify(keys, null, 2));
        }
    } catch (error) {
        console.error('Ошибка получения ключей:', error.response ? error.response.data : error.message);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
});
