require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('pg');
const { getUsersWithKeys, getUsers, getKeysFromDatabase } = require('../functions/adminFunctions');
const { saveClient } = require('../functions/clientFunctions');
const { showMainKeyboard } = require('../functions/showMainKeyboard');
const { requestNewKey, createNewKey } = require('../functions/keyFunctions');

// Загрузка данных из .env
const token = process.env.TELEGRAM_TOKEN;
const adminId = process.env.ADMIN_ID?.toString();

// Конфигурация PostgreSQL
const dbConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_NAME,
};

// Подключение к PostgreSQL
const db = new Client(dbConfig);
db.connect()
    .then(() => console.log("Подключение к PostgreSQL успешно"))
    .catch(err => {
        console.error("Ошибка подключения к PostgreSQL:", err);
        process.exit(1);
    });

// Проверка на наличие токена и adminId
if (!token || !adminId) {
    console.error('Ошибка: TELEGRAM_TOKEN или ADMIN_ID не заданы в .env');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log("Бот запущен...");
console.log(`Загруженный Admin ID: ${adminId}`);

// Глобальный объект для обработки запросов на ключи
let pendingKeyRequests = {};

// Функция для проверки прав администратора
function isAdmin(userId) {
    const isAdminUser = String(userId) === String(adminId);
    console.log(`[isAdmin] Проверка пользователя ${userId} на администраторские права: ${isAdminUser ? "является администратором" : "не является администратором"}`);
    return isAdminUser;
}

// Функция для безопасной отправки сообщений, чтобы избежать ошибок при пустом тексте
async function sendSafeMessage(bot, chatId, text, options = {}) {
    if (text && text.trim()) {
        await bot.sendMessage(chatId, text, options);
    } else {
        console.warn(`[sendSafeMessage] Пустое сообщение не отправлено для chatId = ${chatId}`);
    }
}

// Обработка входящих сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.username || msg.from.first_name || "Неизвестный";
    const text = msg.text?.trim();

    console.log(`[onMessage] Получено сообщение: "${text}" от пользователя ID = ${userId}, чат ID = ${chatId}`);

    const isAdminUser = isAdmin(userId);
    try {
        if (text === '/start' || text === '/menu') {
            console.log("[onMessage] Команда /start или /menu. Отправка клавиатуры и сохранение пользователя.");
            await sendSafeMessage(bot, chatId, 'Добро пожаловать! Чем могу помочь?');
            showMainKeyboard(bot, chatId, isAdminUser);
            await saveClient(userId, userName);
        } else if (text === 'Инструкция') {
            console.log("[onMessage] Команда 'Инструкция'. Отправка инструкций.");
            await sendSafeMessage(bot, chatId, 'Это инструкция по использованию бота. Для получения дополнительной информации, используйте доступные команды.', {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'iOS', url: 'https://itunes.apple.com/us/app/outline-app/id1356177741' },
                            { text: 'Android', url: 'https://play.google.com/store/apps/details?id=org.outline.android.client' },
                            { text: 'Windows', url: 'https://s3.amazonaws.com/outline-releases/client/windows/stable/Outline-Client.exe' }
                        ],
                        [
                            { text: 'Поддержка', url: 'https://t.me/bagamedovit' }
                        ]
                    ]
                }
            });
        } else if (text === 'Запросить ключ') {
            console.log("[onMessage] Команда 'Запросить ключ'. Запрос подтверждения у администратора.");
            await sendSafeMessage(bot, chatId, 'Идет генерация нового ключа 🔁');
            await requestNewKey(bot, userId, chatId, userName, adminId, pendingKeyRequests);
            showMainKeyboard(bot, chatId, isAdminUser);
        } else if (text === 'Список пользователей с ключами') {
            console.log("[onMessage] Команда 'Список пользователей с ключами'. Проверка прав администратора.");
            if (isAdminUser) {
                await getUsersWithKeys(chatId, bot);
                showMainKeyboard(bot, chatId, isAdminUser);
            } else {
                console.warn("[onMessage] Пользователь не является администратором. Отказ в доступе.");
                await sendSafeMessage(bot, chatId, 'У вас нет доступа к этой команде.');
            }
        } else if (text === 'Список пользователей') {
            console.log("[onMessage] Команда 'Список пользователей'. Проверка прав администратора.");
            if (isAdminUser) {
                await getUsers(chatId, bot);
                showMainKeyboard(bot, chatId, isAdminUser);
            } else {
                console.warn("[onMessage] Пользователь не является администратором. Отказ в доступе.");
                await sendSafeMessage(bot, chatId, 'У вас нет доступа к этой команде.');
            }
        } else if (text === 'Список ключей') {
            console.log("[onMessage] Команда 'Список ключей'. Проверка прав администратора.");
            if (isAdminUser) {
                await getKeysFromDatabase(chatId, bot);
                showMainKeyboard(bot, chatId, isAdminUser);
            } else {
                console.warn("[onMessage] Пользователь не является администратором. Отказ в доступе.");
                await sendSafeMessage(bot, chatId, 'У вас нет доступа к этой команде.');
            }
        } else if (text === 'Создать ключ') {
            console.log("[onMessage] Команда 'Создать ключ'. Проверка прав администратора.");
            if (isAdminUser) {
                await requestNewKey(bot, userId, chatId, userName, adminId, pendingKeyRequests);
                showMainKeyboard(bot, chatId, isAdminUser);
            } else {
                console.warn("[onMessage] Пользователь не является администратором. Отказ в доступе.");
                await sendSafeMessage(bot, chatId, 'У вас нет прав для этой команды.');
            }
        } else {
            console.warn("[onMessage] Неизвестная команда. Пользователь не имеет прав.");
            await sendSafeMessage(bot, chatId, 'У вас нет прав для этой команды.');
        }
    } catch (error) {
        console.error("[onMessage] Ошибка при обработке сообщения:", error);
        await sendSafeMessage(bot, chatId, "Произошла ошибка. Попробуйте позже.");
    }
});

// Функция для безопасной отправки сообщений
async function sendSafeMessage(bot, chatId, message, options = {}) {
    if (message && message.trim()) {
        await bot.sendMessage(chatId, message, options);
    } else {
        console.warn("[sendSafeMessage] Пустое сообщение, отправка отменена.");
    }
}

// Обработка callback_query для подтверждения или отклонения запросов на ключи
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const [action, requestId] = data.split('_');

    console.log(`[callback_query] Получен callback_query с действием: ${action} и requestId: ${requestId}`);

    if (action === 'confirm') {
        console.log(`[callback_query] Подтверждение запроса на ключ для requestId: ${requestId}`);

        // Проверяем, существует ли запрос в pendingKeyRequests
        if (!pendingKeyRequests[requestId]) {
            console.error(`[callback_query] Ошибка: Запрос с requestId ${requestId} не найден в pendingKeyRequests.`);
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Запрос не найден или уже обработан.', show_alert: true });
            return;
        }

        const { userId, chatId, userName } = pendingKeyRequests[requestId];

        console.log(`[callback_query] Данные запроса: userId = ${userId}, chatId = ${chatId}, userName = ${userName}`);

        if (userId) {
            const { formattedKey, creationDate } = await createNewKey(bot, userId, chatId);
            if (formattedKey && creationDate) {
                console.log(`[callback_query] Ключ успешно создан для пользователя ${userId}. Отправка данных.`);

                await sendSafeMessage(bot, chatId, `Скопируйте ключ целиком из сообщения ниже 👇\n\nВаш ключ: ${formattedKey}`);
                await sendSafeMessage(bot, chatId, `Дата создания: ${creationDate.toISOString().slice(0, 19).replace("T", " ")}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Скопировать ✅', callback_data: 'copy_key' }]
                        ]
                    }
                });
                await sendSafeMessage(bot, adminId, `Ключ успешно выдан пользователю с ID = ${userId}.`);
            } else {
                console.error("[callback_query] Ошибка при создании ключа. Сообщение пользователю.");
                await sendSafeMessage(bot, chatId, 'Не удалось создать ключ. Попробуйте позже.');
            }

            // Удаляем запрос из списка pendingKeyRequests
            delete pendingKeyRequests[requestId];
        } else {
            console.warn(`[callback_query] Данные пользователя для requestId ${requestId} не найдены.`);
        }
    } else if (action === 'decline') {
        console.log(`[callback_query] Отклонение запроса на ключ для requestId: ${requestId}`);

        if (pendingKeyRequests[requestId]) {
            const { chatId } = pendingKeyRequests[requestId];
            await sendSafeMessage(bot, chatId, 'Запрос на создание ключа был отклонен администратором.');
            delete pendingKeyRequests[requestId];
        } else {
            console.warn(`[callback_query] Запрос на отклонение: requestId ${requestId} не найден.`);
        }
    }

    // Обработка нажатия на кнопку "Скопировать ✅"
    if (data === 'copy_key') {
        console.log("[callback_query] Нажата кнопка 'Скопировать ✅'");
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ключ скопирован!', show_alert: true });
    } else {
        // Обычный ответ на callback_query для кнопок confirm/decline
        await bot.answerCallbackQuery(callbackQuery.id);
    }
});

// Обработка ошибок опроса
bot.on('polling_error', (error) => console.error("[polling_error] Ошибка опроса:", error));