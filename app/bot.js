require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const { saveClient } = require('../functions/clientFunctions');
const { createAndSendKey } = require('../functions/keyFunctions');
const { getUsersWithKeys, getUsers, requestPaymentDetails, handleAdminPaymentMessage } = require('../functions/adminFunctions');
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
    let command = msg.text ? msg.text.trim().toLowerCase() : null;

    console.log(`[5] Получена команда: ${command || 'не команда'} от пользователя ID ${userId}`);
    try {
        if (isAdminUser && command === 'список ключей') {
            try {
                console.log(`[64] Вызов функции getKeysFromDatabase`);
                const keys = await getKeysFromDatabase(); // Получаем ключи из базы данных
                console.log(`[65] Получено ${keys.length} ключей из базы данных`);

                if (keys.length > 0) {
                    const chunkSize = 10; // Количество ключей в одном сообщении
                    for (let i = 0; i < keys.length; i += chunkSize) {
                        const chunk = keys.slice(i, i + chunkSize);
                        let message = 'Список ключей:\n';
                        chunk.forEach((key, index) => {
                            message += `${i + index + 1}. ${key.name} - ${key.server}\n`;
                        });
                        await bot.sendMessage(chatId, message);
                    }
                } else {
                    await bot.sendMessage(chatId, 'Нет доступных ключей.');
                }
            } catch (error) {
                console.error(`[Error] Ошибка получения списка ключей:`, error);
                await bot.sendMessage(chatId, 'Не удалось получить список ключей. Попробуйте позже.');
            }
            return;
        }

        if (isAdminUser && command === 'создать ключ') {
            await bot.sendMessage(chatId, 'Админ может создать ключ.');

            // Обновляем список доступных серверов перед их отображением
            await monitorServers(bot, adminId);

            if (availableServers.length > 0) {
                const buttons = availableServers.map(server => [
                    { text: server.name, callback_data: `select_server_${server.name}` }
                ]);

                await bot.sendMessage(chatId, 'Выберите сервер для создания ключа:', {
                    reply_markup: { inline_keyboard: buttons }
                });
            } else {
                await bot.sendMessage(chatId, 'Нет доступных серверов для создания ключа.');
            }

            return;
        }

        if (command === 'запросить ключ') {
            await monitorServers(bot, adminId);
            await showServerSelection(bot, chatId, availableServers);
            return;
        }

        if (msg.photo) {
            console.log(`[50] Получена квитанция (фото) от пользователя ID ${userId}`);
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            await bot.sendPhoto(adminId, fileId, {
                caption: `Клиент ID ${userId} отправил квитанцию об оплате.`
            });
            await bot.sendMessage(adminId, `Подтвердите или отклоните платеж для клиента ID ${userId}:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Подтвердить оплату', callback_data: `approve_payment_${userId}` }],
                        [{ text: 'Отклонить оплату', callback_data: `decline_payment_${userId}` }]
                    ]
                }
            });
            return;
        }

        if (msg.document) {
            console.log(`[52] Получен документ от пользователя ID ${userId}`);
            const fileId = msg.document.file_id;
            await bot.sendDocument(adminId, fileId, {
                caption: `Клиент ID ${userId} отправил документ об оплате.`
            });
            await bot.sendMessage(adminId, `Подтвердите или отклоните платеж для клиента ID ${userId}:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Подтвердить оплату', callback_data: `approve_payment_${userId}` }],
                        [{ text: 'Отклонить оплату', callback_data: `decline_payment_${userId}` }]
                    ]
                }
            });
            return;
        }

        if (command === '/start' || command === '/menu') {
            await bot.sendMessage(chatId, 'Добро пожаловать! Чем могу помочь?');
            showMainKeyboard(bot, chatId, isAdminUser);
            await saveClient(userId, msg.from.username || msg.from.first_name || 'Неизвестный');
        } else {
            await bot.sendMessage(chatId, "Команда не распознана. Пожалуйста, отправьте команду или квитанцию.");
        }
    } catch (error) {
        console.error(`[Error] Ошибка обработки команды:`, error);
        await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
});

// Обработчик callback_query
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    console.log(`[17] Обработка callback_query: ${data}`);

    if (data.startsWith('select_server_')) {
        const serverName = data.split('select_server_')[1];
        const selectedServer = availableServers.find(server => server.name === serverName);

        if (!selectedServer) {
            await bot.sendMessage(userId, 'Ошибка при выборе сервера. Попробуйте снова.');
            return;
        }

        // Если пользователь администратор, сразу создаем ключ
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
    } else if (data.startsWith('payment_confirmed_')) {
        const clientChatId = data.split('payment_confirmed_')[1];
        await bot.sendMessage(clientChatId, "Отправьте фото или документ квитанции для подтверждения оплаты.");
    } else if (data.startsWith('approve_payment_')) {
        const clientChatId = data.split('approve_payment_')[1];
        const { server } = pendingKeyRequests[clientChatId] || {};

        if (!server) {
            await bot.sendMessage(adminId, 'Ошибка: данные для создания ключа не найдены.');
            return;
        }

        try {
            await createAndSendKey(bot, clientChatId, clientChatId, server.name, server.apiUrl, server.name, adminId);
            await bot.sendMessage(clientChatId, "Ваш платеж подтвержден. Ключ успешно создан.");
            await bot.sendMessage(adminId, `Ключ для пользователя ID ${clientChatId} успешно создан.`);
        } catch (error) {
            console.error(`[Error] Ошибка создания ключа для клиента ID ${clientChatId}:`, error);
        }
    } else if (data.startsWith('decline_payment_')) {
        const clientChatId = data.split('decline_payment_')[1];
        delete pendingKeyRequests[clientChatId];
        await bot.sendMessage(clientChatId, 'Ваш платеж был отклонен. Пожалуйста, свяжитесь с администратором для уточнения.');
        await bot.sendMessage(adminId, `Платеж клиента ID ${clientChatId} отклонен.`);
    }
});