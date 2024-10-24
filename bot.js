require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const token = process.env.TELEGRAM_TOKEN;

if (!token) {
    console.error('Ошибка: TELEGRAM_TOKEN не установлен в .env файле.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Функция для отображения клавиатуры с кнопкой "Старт"
function showStartKeyboard(chatId) {
    const options = {
        reply_markup: {
            keyboard: [
                [{ text: 'Старт' }]
            ],
            resize_keyboard: true, // Подгонка размера клавиатуры под экран
            one_time_keyboard: true // Клавиатура исчезнет после нажатия
        }
    };

    bot.sendMessage(chatId, 'Нажмите кнопку «Старт» для продолжения:', options);
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    showStartKeyboard(chatId); // Отправляем клавиатуру при старте
});

// Обработка нажатия кнопки "Старт"
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === 'Старт') {
        bot.sendMessage(chatId, 'Вы нажали кнопку «Старт». Чем я могу вам помочь?');
        // Здесь вы можете добавить любую другую логику
    }
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Функция для создания нового ключа Outline
async function createNewKey(user_id) {
    try {
        // Шаг 1: Создание ключа
        const createResponse = await axios.post(`${OUTLINE_SERVER}${OUTLINE_API}`, {}, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) // Игнорируем ошибки сертификатов
        });
        const key_id = createResponse.data.id;

        // Шаг 2: Переименование ключа для привязки к Telegram пользователю
        const keyName = `key_${user_id}`;
        await axios.put(`${OUTLINE_SERVER}${OUTLINE_API}/${key_id}/name`, { name: keyName }, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) // Игнорируем ошибки сертификатов
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
    const hexUserId = user_id.toString(16);
    return `${OUTLINE_USERS_GATEWAY}/conf/${OUTLINE_SALT}${hexUserId}#${CONN_NAME}`;
}

// Обработка команды бота для создания нового ключа
bot.onText(/\/create_key/, async (msg) => {
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
        const response = await axios.get(`${OUTLINE_SERVER}${OUTLINE_API}`, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        // Логирование ответа от сервера для отладки
        console.log('Ответ от сервера:', response.data);

        // Извлекаем массив ключей из объекта
        const keys = response.data.accessKeys;

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
            bot.sendMessage(chatId, 'Ошибка: Ожидался массив ключей, но получен другой формат.\nОтвет от API:\n' + JSON.stringify(keys, null, 2));
        }
    } catch (error) {
        console.error('Ошибка получения ключей:', error.response ? error.response.data : error.message);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
});

