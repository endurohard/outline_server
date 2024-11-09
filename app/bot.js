require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const { saveClient } = require('../functions/clientFunctions');
const { createAndSendKey } = require('../functions/keyFunctions');
const { getUsersWithKeys, getUsers, requestPaymentDetails, handleAdminPaymentMessage, forwardReceipt } = require('../functions/adminFunctions');
const getServersFromEnv = require('../functions/generateServers');
const { monitorServers } = require('../functions/serverMonitor');
const getKeysFromDatabase = require('../functions/getKeysFromDatabase');
const sendLongMessage = require('../functions/sendLongMessage');
const showMainKeyboard = require('../functions/showMainKeyboard');
const { availableServers } = require('../functions/serverMonitor');


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

// Запуск мониторинга серверов
monitorServers(bot, adminId);

const lastCommand = {};
const pendingKeyRequests = {};
const pendingPaymentRequests = {};

// Отправка списка доступных серверов
async function showServerSelection(bot, chatId) {
    console.log(`[3] Вызов showServerSelection для пользователя ID ${chatId}`);
    console.log(`[Debug] Доступные серверы перед отправкой: ${JSON.stringify(availableServers)}`);

    if (availableServers.length === 0) {
        await bot.sendMessage(chatId, 'К сожалению, в данный момент нет доступных серверов. Пожалуйста, попробуйте позже.');
        return;
    }

    const buttons = availableServers.map(server => [
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
    const isAdminUser = userId.toString() === adminId;
    const command = msg.text ? msg.text.trim().toLowerCase() : null;

    console.log(`[5] Получена команда: ${command || 'не команда'} от пользователя ID ${userId} (Chat ID: ${chatId})`);

    try {
        if (command === '/start' || command === '/menu') {
            console.log(`[INFO] Пользователь ID ${userId} вызвал команду ${command}`);
            showMainKeyboard(bot, chatId, isAdminUser);
            await saveClient(userId, msg.from.username || msg.from.first_name || 'Неизвестный');
            return;
        }

        if (isAdminUser) {
            console.log(`[INFO] Администратор отправил сообщение: ${msg.text}`);

            if (command === 'список ключей') {
                console.log(`[INFO] Запрос списка ключей`);

                try {
                    // Отправка списка ключей в Excel
                    await getKeysFromDatabase(bot, chatId); // Этот вызов создаст и отправит Excel файл с ключами
                } catch (error) {
                    console.error(`[ERROR] Ошибка при получении списка ключей:`, error);
                    await bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
                }
                return;
            }

            // Обрабатываем платежное сообщение, если есть активный запрос на реквизиты
            const requestKey = Object.keys(pendingPaymentRequests).find(key => key.startsWith(`${adminId}_${chatId}`));
            if (requestKey) {
                console.log(`[INFO] Обработка платежного сообщения от администратора`);
                await handleAdminPaymentMessage(bot, msg, pendingPaymentRequests);
                return;
            }

            if (command === 'список пользователей с ключами') {
                console.log(`[INFO] Запрос списка пользователей с ключами`);
                await getKeysFromDatabaseAndSend(bot, chatId);
                return;
            }

            if (command === 'создать ключ') {
                console.log(`[INFO] Запрос на создание ключа`);
                await monitorServers(bot, adminId);

                const buttons = availableServers.map(server => [
                    { text: server.name, callback_data: `select_server_${server.name}` }
                ]);

                if (buttons.length) {
                    await bot.sendMessage(chatId, 'Выберите сервер для создания ключа:', {
                        reply_markup: { inline_keyboard: buttons }
                    });
                } else {
                    await bot.sendMessage(chatId, 'Нет доступных серверов для создания ключа.');
                }
                return;
            }

            console.log(`[INFO] Сообщение от администратора не связано с платежами и обработано.`);
            return;
        }

        if (command === 'запросить ключ') {
            console.log(`[INFO] Пользователь ID ${userId} запросил ключ`);
            await showServerSelection(bot, chatId);
            return;
        }

        if (msg.photo) {
            console.log(`[50] Получена квитанция (фото) от пользователя ID ${userId}`);
            await forwardReceipt(bot, msg, userId, adminId);
            return;
        }

        if (msg.document) {
            console.log(`[52] Получен документ от пользователя ID ${userId}`);
            await forwardDocument(bot, msg, userId, adminId);
            return;
        }

        console.warn(`[Warning] Команда "${command}" не распознана для пользователя ID ${userId}`);
        await bot.sendMessage(chatId, 'Команда не распознана. Пожалуйста, отправьте команду или квитанцию.');
    } catch (error) {
        console.error(`[Error] Ошибка обработки команды:`, error);
        await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
});

// Обработчик callback_query
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;

    console.log(`[17] Обработка callback_query: ${data}`);

    if (data.startsWith('select_server_')) {
        const serverName = data.split('select_server_')[1];
        const selectedServer = availableServers.find(server => server.name === serverName);

        if (!selectedServer) {
            console.error(`[Error] Сервер "${serverName}" не найден.`);
            await bot.sendMessage(chatId, 'Выбранный сервер не доступен. Попробуйте снова.');
            return;
        }

        console.log(`[INFO] Пользователь ID ${userId} выбрал сервер "${serverName}"`);

        if (userId.toString() === adminId) {
            try {
                console.log(`[22] Администратор выбрал сервер: ${serverName}`);
                await createAndSendKey(bot, userId, userId, selectedServer.name, selectedServer.apiUrl, selectedServer.name, adminId);
                await bot.sendMessage(userId, "Ключ успешно создан.");
            } catch (error) {
                console.error(`[Error] Ошибка создания ключа для администратора ID ${userId}:`, error);
                await bot.sendMessage(userId, 'Произошла ошибка при создании ключа. Попробуйте позже.');
            }
        } else {
            // Для обычных пользователей инициируем процесс оплаты
            pendingKeyRequests[userId] = { server: selectedServer };
            await bot.sendMessage(userId, `Вы выбрали сервер "${selectedServer.name}". Ожидайте реквизитов для оплаты от администратора.`);
            await requestPaymentDetails(bot, adminId, userId, callbackQuery.from.username || `ID ${userId}`, pendingPaymentRequests);
        }
        return;
    }

    if (data.startsWith('payment_confirmed_')) {
        const clientChatId = data.split('payment_confirmed_')[1];
        console.log(`[INFO] Клиент ID ${clientChatId} подтвердил оплату.`);
        await bot.sendMessage(clientChatId, "Отправьте фото или документ квитанции для подтверждения оплаты.");
        return;
    }

    if (data.startsWith('approve_payment_')) {
        const clientChatId = data.split('approve_payment_')[1];
        const { server } = pendingKeyRequests[clientChatId] || {};

        if (!server) {
            console.error(`[Error] Данные для создания ключа клиента ID ${clientChatId} не найдены.`);
            await bot.sendMessage(adminId, 'Ошибка: данные для создания ключа не найдены.');
            return;
        }

        try {
            await createAndSendKey(bot, clientChatId, clientChatId, server.name, server.apiUrl, server.name, adminId);
            await bot.sendMessage(clientChatId, "Ваш платеж подтвержден. Ключ успешно создан.");
            await bot.sendMessage(adminId, `Ключ для пользователя ID ${clientChatId} успешно создан.`);
            delete pendingKeyRequests[clientChatId];
        } catch (error) {
            console.error(`[Error] Ошибка создания ключа для клиента ID ${clientChatId}:`, error);
        }
        return;
    }

    if (data.startsWith('decline_payment_')) {
        const clientChatId = data.split('decline_payment_')[1];
        delete pendingKeyRequests[clientChatId];
        await bot.sendMessage(clientChatId, 'Ваш платеж был отклонен. Пожалуйста, свяжитесь с администратором для уточнения.');
        await bot.sendMessage(adminId, `Платеж клиента ID ${clientChatId} отклонен.`);
        return;
    }

    console.warn(`[Warning] Неизвестный callback_query: ${data}`);
});