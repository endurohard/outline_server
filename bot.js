require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Получение токена и настроек из переменных окружения
const token = process.env.TELEGRAM_TOKEN;
const OUTLINE_SERVER = process.env.OUTLINE_API_URL;
const adminId = process.env.ADMIN_ID; // Убедитесь, что в .env указан ваш ID

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

// Функция для отображения клавиатуры с кнопками
function showMainKeyboard(chatId) {
    const options = {
        reply_markup: {
            keyboard: [
                [{ text: 'Старт' }],
                [{ text: 'Создать ключ' }, { text: 'Список ключей' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };

    bot.sendMessage(chatId, 'Выберите действие:', options);
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    showMainKeyboard(chatId); // Отправляем клавиатуру при старте
});

// Проверка на администратора
function isAdmin(chatId) {
    return chatId.toString() === adminId;
}

// Обработка нажатия кнопки "Старт"
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === 'Старт') {
        bot.sendMessage(chatId, 'Вы нажали кнопку «Старт». Чем я могу вам помочь?');
        showMainKeyboard(chatId);
    } else if (text === 'Создать ключ') {
        if (isAdmin(chatId)) { // Проверка на админа
            const userId = msg.from.id;
            const dynamicLink = await createNewKey(userId);
            if (dynamicLink) {
                bot.sendMessage(chatId, `Ваша динамическая ссылка: ${dynamicLink}`);
            } else {
                bot.sendMessage(chatId, `Извините, что-то пошло не так.`);
            }
        } else {
            bot.sendMessage(chatId, 'У вас нет доступа к этой команде.');
        }
    } else if (text === 'Список ключей') {
        if (isAdmin(chatId)) { // Проверка на админа
            await getKeys(chatId);
        } else {
            bot.sendMessage(chatId, 'У вас нет доступа к этой команде.');
        }
    }
});

// Функция для создания нового ключа Outline
async function createNewKey(user_id) {
    try {
        const createResponse = await axios.post(`${OUTLINE_SERVER}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        const key_id = createResponse.data.id;

        const keyName = `key_${user_id}`;
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