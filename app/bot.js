require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const { saveClient } = require('../functions/clientFunctions');
const { createAndSendKey } = require('../functions/keyFunctions');
const { getUsersWithKeys, getUsers, requestPaymentDetails, handleAdminPaymentMessage } = require('../functions/adminFunctions');
const getServersFromEnv = require('../functions/generateServers');
const servers = getServersFromEnv();  // Загружаем серверы из .env
const getKeysFromDatabase = require('../functions/getKeysFromDatabase');
const sendLongMessage = require('../functions/sendLongMessage');
const showMainKeyboard = require('../functions/showMainKeyboard');

const token = process.env.TELEGRAM_TOKEN;
const adminId = process.env.ADMIN_ID?.toString();
const db = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_NAME,
});

const bot = new TelegramBot(token, { polling: true });
console.log("[Bot] Бот запущен...");

const lastCommand = {};
const pendingKeyRequests = {};
const pendingPaymentRequests = {};

// Определение функции sendSafeMessage
async function sendSafeMessage(bot, chatId, text, options = {}) {
    if (text && text.trim()) {
        await bot.sendMessage(chatId, text, options);
    }
}

// Отправка списка серверов для выбора
async function showServerSelection(bot, chatId) {
    const servers = getServersFromEnv();  // убедимся, что массив серверов инициализирован заново
    console.log(`[showServerSelection] Отправка списка серверов для выбора пользователю ID ${chatId}`);

    const buttons = servers.map(server => [
        { text: server.name, callback_data: `select_server_${server.name}` }
    ]);

    await bot.sendMessage(chatId, 'Выберите сервер для создания ключа:', {
        reply_markup: { inline_keyboard: buttons }
    });
    console.log(`[showServerSelection] Список серверов отправлен пользователю ID ${chatId}`);
}

// Код для обработки команд пользователя с логированием
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const command = msg.text?.trim().toLowerCase();
    const isAdminUser = userId.toString() === adminId; // Проверка администратора

    console.log(`[onMessage] Получена команда: ${command} от пользователя ID ${userId}`);

    try {
        // Вызов `showMainKeyboard` при командах `/start` или `/menu` для показа клавиатуры
        if (command === '/start' || command === '/menu') {
            console.log(`[onMessage] Отображение главной клавиатуры`);
            await bot.sendMessage(chatId, 'Добро пожаловать! Чем могу помочь?');
            showMainKeyboard(bot, chatId, isAdminUser); // Показываем клавиатуру
            await saveClient(userId, msg.from.username || msg.from.first_name || 'Неизвестный');
        }

        if (isAdminUser) {
            // Команды администратора
            if (command === 'создать ключ') {
                console.log(`[onMessage] Выполняется команда 'создать ключ' администратором`);
                await sendSafeMessage(bot, chatId, 'Выберите сервер для создания ключа:');
                await showServerSelection(bot, chatId);
            } else if (command === 'список пользователей') {
                console.log(`[onMessage] Выполняется команда 'список пользователей' администратором`);
                await getUsers(bot, chatId);
            } else if (command === 'список ключей') {
                console.log(`[onMessage] Выполняется команда 'список ключей' администратором`);
                await getKeysFromDatabase(bot, chatId);
            } else if (command === 'список пользователей с ключами') {
                console.log(`[onMessage] Выполняется команда 'список пользователей с ключами' администратором`);
                await getUsersWithKeys(bot, chatId);
            } else if (command === 'инструкция') {
                console.log(`[onMessage] Выполняется команда 'инструкция' для пользователя ID = ${userId}`);
                await sendSafeMessage(bot, chatId, 'Выберите версию программы для скачивания:', {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Скачать для iOS', url: 'https://itunes.apple.com/us/app/outline-app/id1356177741' },
                                { text: 'Скачать для Android', url: 'https://play.google.com/store/apps/details?id=org.outline.android.client' }
                            ],
                            [
                                { text: 'Скачать для Windows', url: 'https://s3.amazonaws.com/outline-releases/client/windows/stable/Outline-Client.exe' },
                                { text: 'Скачать для macOS', url: 'https://itunes.apple.com/us/app/outline-app/id1356177741?mt=12' }
                            ],
                            [
                                { text: 'Тех поддержка', url: 'https://t.me/bagamedovit' }  // Замените на сайт, если нужно
                            ]
                        ]
                    }
                });
                console.log(`[onMessage] Кнопки для скачивания отправлены пользователю ID = ${userId}`);
            } else {
                await sendSafeMessage(bot, chatId, "Неизвестная команда администратора.");
            }
        } else {
            // Команды для обычных пользователей
            if (command === 'запросить ключ') {
                console.log(`[onMessage] Пользователь запросил ключ`);
                await sendSafeMessage(bot, chatId, 'Выберите сервер для запроса ключа:');
                await showServerSelection(bot, chatId);
            } else if (command === 'инструкция') {
                console.log(`[onMessage] Выполняется команда 'инструкция' для пользователя ID = ${userId}`);
                await sendSafeMessage(bot, chatId, 'Выберите версию программы для скачивания:', {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Скачать для iOS', url: 'https://itunes.apple.com/us/app/outline-app/id1356177741' },
                                { text: 'Скачать для Android', url: 'https://play.google.com/store/apps/details?id=org.outline.android.client' }
                            ],
                            [
                                { text: 'Скачать для Windows', url: 'https://s3.amazonaws.com/outline-releases/client/windows/stable/Outline-Client.exe' },
                                { text: 'Скачать для macOS', url: 'https://itunes.apple.com/us/app/outline-app/id1356177741?mt=12' }
                            ],
                            [
                                { text: 'Тех поддержка', url: 'https://t.me/bagamedovit' }  // Замените на сайт, если нужно
                            ]
                        ]
                    }
                });
                console.log(`[onMessage] Кнопки для скачивания отправлены пользователю ID = ${userId}`);
            } else {
                await sendSafeMessage(bot, chatId, "Неизвестная команда администратора.");
            }
        }
    } catch (error) {
        console.error(`[onMessage] Ошибка: ${error}`);
        await sendSafeMessage(bot, chatId, "Произошла ошибка. Попробуйте позже.");
    }
});

// Обработчик callback_query для выбора сервера и создания ключа
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;

    if (data.startsWith('select_server_')) {
        const serverName = data.split('select_server_')[1];
        const selectedServer = servers.find(server => server.name === serverName);

        if (!selectedServer) {
            console.log("[callback_query] Ошибка: выбранный сервер не найден.");
            await bot.sendMessage(chatId, "Ошибка при выборе сервера. Попробуйте снова.");
            return;
        }

        console.log(`[callback_query] Пользователь выбрал сервер: ${selectedServer.name} с URL: ${selectedServer.apiUrl}`);
        await createAndSendKey(bot, userId, chatId, selectedServer.name, selectedServer.apiUrl, selectedServer.name);
    }
});