require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const { saveClient } = require('../functions/clientFunctions');
const { createAndSendKey } = require('../functions/keyFunctions');
console.log('[Main] Функция createAndSendKey импортирована');
const { getUsersWithKeys, getUsers, requestPaymentDetails, handleAdminPaymentMessage } = require('../functions/adminFunctions');
const getServersFromEnv = require('../functions/generateServers');
const servers = getServersFromEnv();
const getKeysFromDatabase = require('../functions/getKeysFromDatabase');
const sendLongMessage = require('../functions/sendLongMessage');
const showMainKeyboard = require('../functions/showMainKeyboard');

const token = process.env.TELEGRAM_TOKEN;
const adminId = process.env.ADMIN_ID?.toString();
console.log(`[1] Администраторский ID загружен: ${adminId}`);
const db = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_NAME,
});

const bot = new TelegramBot(token, { polling: true });
console.log("[2] Бот запущен...");

const lastCommand = {};
const pendingKeyRequests = {};
const pendingPaymentRequests = {};

// Отправка списка серверов для выбора
async function showServerSelection(bot, chatId) {
    console.log(`[3] Вызов showServerSelection для пользователя ID ${chatId}`);

    const buttons = servers.map(server => [
        { text: server.name, callback_data: `select_server_${server.name}` }
    ]);

    await bot.sendMessage(chatId, 'Выберите сервер для создания ключа:', {
        reply_markup: { inline_keyboard: buttons }
    });
    console.log(`[4] Список серверов отправлен пользователю ID ${chatId}`);
}

// Обработчик сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const command = msg.text?.trim().toLowerCase();
    const isAdminUser = userId.toString() === adminId;

    console.log(`[5] Получена команда: ${command} от пользователя ID ${userId}`);

    try {
        if (command === '/start' || command === '/menu') {
            await bot.sendMessage(chatId, 'Добро пожаловать! Чем могу помочь?');
            console.log(`[6] Главная клавиатура отправлена пользователю ID ${userId}`);
            showMainKeyboard(bot, chatId, isAdminUser);
            await saveClient(userId, msg.from.username || msg.from.first_name || 'Неизвестный');
            console.log(`[7] Пользователь ${userId} сохранен в базе данных`);
        }

        if (isAdminUser) {
            if (command === 'создать ключ') {
                console.log(`[8] Администратор ${userId} запросил создание ключа`);
                await showServerSelection(bot, chatId);
                console.log(`[9] Список серверов отправлен администратору ID ${userId}`);
            } else if (command === 'список пользователей') {
                await getUsers(bot, chatId);
                console.log(`[10] Список пользователей отправлен администратору ID ${userId}`);
            } else if (command === 'список ключей') {
                await getKeysFromDatabase(bot, chatId);
                console.log(`[11] Список ключей отправлен администратору ID ${userId}`);
            } else if (command === 'список пользователей с ключами') {
                await getUsersWithKeys(bot, chatId);
                console.log(`[12] Список пользователей с ключами отправлен администратору ID ${userId}`);
            }
        } else {
            if (command === 'запросить ключ') {
                console.log(`[13] Пользователь ${userId} запросил создание ключа`);
                await bot.sendMessage(chatId, 'Ваш запрос отправлен администратору на подтверждение.');

                await bot.sendMessage(adminId, `Пользователь ID ${userId} запросил создание ключа. Подтвердите запрос.`, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Подтвердить', callback_data: `confirm_create_key_${userId}` },
                                { text: 'Отклонить', callback_data: `decline_create_key_${userId}` }
                            ]
                        ]
                    }
                });
                console.log(`[14] Запрос на создание ключа отправлен администратору от пользователя ID ${userId}`);
            } else if (command === 'инструкция') {
                console.log(`[15] Пользователь ${userId} запросил инструкцию`);
                await bot.sendMessage(chatId, 'Выберите версию программы для скачивания:', {
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
                                { text: 'Тех поддержка', url: 'https://t.me/bagamedovit' }
                            ]
                        ]
                    }
                });
                console.log(`[16] Инструкция отправлена пользователю ID ${userId}`);
            }
        }
    } catch (error) {
        console.error(`[Error] Ошибка в обработчике команды для пользователя ID ${userId}:`, error);
        await bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.");
    }
});

// Обработчик callback_query для подтверждения создания ключа
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;

    console.log(`[17] Обработка callback_query: ${data}`);

    // Если администратор подтверждает создание ключа
    if (data.startsWith('confirm_create_key_')) {
        const requestedUserId = data.split('confirm_create_key_')[1];
        console.log(`[18] Подтверждение создания ключа для пользователя ID ${requestedUserId}`);

        // Проверка наличия ID пользователя и сервера
        if (!requestedUserId) {
            console.error("[19] Ошибка: ID пользователя не найден");
            await bot.sendMessage(adminId, "Ошибка: ID пользователя не найден.");
            return;
        }

        // Отправка сообщения администратору с выбором сервера для создания ключа
        await showServerSelection(bot, requestedUserId);
        console.log(`[20] Список серверов отправлен пользователю ID ${requestedUserId} для выбора`);
    }

    // Если пользователь выбирает сервер
    if (data.startsWith('select_server_')) {
        const serverName = data.split('select_server_')[1];
        const selectedServer = servers.find(server => server.name === serverName);

        if (!selectedServer) {
            console.error(`[21] Ошибка: выбранный сервер ${serverName} не найден.`);
            await bot.sendMessage(chatId, "Ошибка при выборе сервера. Попробуйте снова.");
            return;
        }

        console.log(`[22] Сервер ${serverName} выбран пользователем ID ${chatId}`);

        // Уведомление администратору для подтверждения создания ключа
        await bot.sendMessage(adminId, `Пользователь с ID ${chatId} выбрал сервер "${selectedServer.name}". Подтвердите создание ключа.`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Подтвердить', callback_data: `approve_key_${chatId}_${selectedServer.name}` }],
                    [{ text: 'Отклонить', callback_data: `decline_key_${chatId}` }]
                ]
            }
        });
        console.log(`[23] Запрос на подтверждение создания ключа отправлен администратору.`);
    }

    // Если администратор подтверждает сервер и создание ключа
    if (data.startsWith('approve_key_')) {
        const parts = data.split('_');

        if (parts.length < 3) {
            console.error("[24] Ошибка: некорректные данные в callback_query");
            await bot.sendMessage(adminId, "Ошибка: некорректные данные в запросе.");
            return;
        }

        const requestedUserId = parts[2];
        const serverName = parts.slice(3).join('_'); // Корректно соединяем оставшуюся часть как имя сервера
        const selectedServer = servers.find(server => server.name === serverName);

        if (!selectedServer) {
            console.error(`[25] Ошибка: выбранный сервер "${serverName}" не найден.`);
            await bot.sendMessage(adminId, "Ошибка: выбранный сервер не найден.");
            return;
        }

        console.log(`[26] Администратор подтвердил создание ключа для пользователя ID ${requestedUserId} на сервере ${serverName}`);

        // Создание и отправка ключа
        try {
            await createAndSendKey(bot, parseInt(requestedUserId, 10), parseInt(requestedUserId, 10), selectedServer.name, selectedServer.apiUrl, selectedServer.name, adminId);
            console.log(`[27] Ключ создан и отправлен пользователю ID ${requestedUserId}`);
            await bot.sendMessage(adminId, `Ключ для пользователя ID ${requestedUserId} успешно создан и отправлен.`);
        } catch (error) {
            console.error(`[28] Ошибка при создании ключа для пользователя ID ${requestedUserId}:`, error);
            await bot.sendMessage(adminId, "Ошибка при создании ключа. Попробуйте позже.");
        }
    }
});