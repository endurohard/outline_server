require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');

const { showMainKeyboard } = require('../functions/showMainKeyboard');
const { saveClient } = require('../functions/clientFunctions');
const { getKeysFromDatabase } = require('../functions/getKeysFromDatabase');
const { monitorServers, getAvailableServers } = require('../functions/serverMonitor');
const { getTemplates, showTemplatesKeyboard, addTemplate, deleteTemplate } = require('../functions/templatesFunctions');
const { createAndSendKey } = require('../functions/keyFunctions');
const { requestPaymentDetails, forwardReceipt } = require('../functions/adminFunctions');

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

// Функция выбора сервера

async function showServerSelection(bot, chatId) {
    const servers = await getAvailableServers();
    if (servers.length === 0) {
        await bot.sendMessage(chatId, 'К сожалению, доступных серверов нет.');
        return;
    }

    const buttons = servers.map(server => [
        { text: server.name, callback_data: `select_server_${server.name}` },
    ]);

    await bot.sendMessage(chatId, 'Выберите сервер для создания ключа:', {
        reply_markup: { inline_keyboard: buttons },
    });
}

// Обработчик сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isAdminUser = userId.toString() === adminId; // Проверка администратора
    console.log(`[DEBUG] Проверка adminId: ${adminId}, userId: ${userId}, isAdminUser: ${isAdminUser}`);
    const command = msg.text ? msg.text.trim().toLowerCase() : null;

    console.log(`[5] Получена команда: ${command || 'не команда'} от пользователя ID ${userId} (Chat ID: ${chatId})`);

    try {
        if (command === '/start' || command === '/menu') {
            console.log(`[INFO] Команда ${command} от пользователя ID ${userId}`);
            await bot.sendMessage(chatId, 'Добро пожаловать! Чем могу помочь?');

            console.log(`[DEBUG] Вызов showMainKeyboard для chatId: ${chatId}, isAdminUser: ${isAdminUser}`);
            await showMainKeyboard(bot, chatId, isAdminUser);

            await saveClient(userId, msg.from.username || msg.from.first_name || 'Неизвестный');
            return;
        }

        if (isAdminUser) {
            console.log(`[INFO] Администратор отправил сообщение: ${msg.text}`);
            if (command === 'шаблоны') {
                await showTemplatesKeyboard(bot, chatId);
                return;
            }

            if (command.includes(':')) { // Создание нового шаблона
                const [name, details] = command.split(':').map(part => part.trim());
                if (name && details) {
                    await addTemplate(name, details);
                    await bot.sendMessage(chatId, `Шаблон "${name}" успешно создан.`);
                } else {
                    await bot.sendMessage(chatId, 'Ошибка: неверный формат. Используйте "Название: Детали".');
                }
                return;
            }

            switch (command) {
                case 'список ключей':
                    await getKeysFromDatabase(bot, chatId);
                    break;

                case 'создать ключ':
                    await monitorServers(bot, adminId);
                    await showServerSelection(bot, chatId);
                    break;

                default:
                    console.warn(`[Warning] Команда "${command}" не распознана для администратора.`);
                    await bot.sendMessage(chatId, 'Команда не распознана. Попробуйте снова.');
            }

            return;
        }

        // Логика для обычных пользователей
        if (command === 'запросить ключ') {
            await showServerSelection(bot, chatId);
            return;
        }

        if (msg.photo) {
            console.log(`[50] Получена квитанция от пользователя ID ${userId}`);
            await forwardReceipt(bot, msg, userId, adminId);
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
    const data = callbackQuery.data; // Получаем данные из callback
    const chatId = callbackQuery.message.chat.id; // Получаем chatId из сообщения
    const userId = callbackQuery.from.id; // ID пользователя, который вызвал callback

    console.log(`[17] Обработка callback_query: ${data}`);

    try {
        if (data === 'create_template') {
            await bot.sendMessage(chatId, 'Введите новый шаблон в формате:\n\n`Название: Детали`', { parse_mode: 'Markdown' });
            return;
        }

        if (data.startsWith('send_template_')) {
            const templateId = data.split('send_template_')[1];
            const templates = await getTemplates();
            const selectedTemplate = templates.find(t => t.id == templateId);

            if (!selectedTemplate) {
                await bot.sendMessage(chatId, 'Ошибка: шаблон не найден.');
                return;
            }

            const pendingRequest = Object.keys(pendingPaymentRequests).find(key => key.startsWith(`${adminId}_`));
            if (pendingRequest) {
                const { clientChatId } = pendingPaymentRequests[pendingRequest];

                await bot.sendMessage(clientChatId, `Реквизиты для оплаты от администратора:\n\n${selectedTemplate.details}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Оплатил', callback_data: `payment_confirmed_${clientChatId}` }]
                        ]
                    }
                });

                console.log(`[INFO] Реквизиты отправлены пользователю ID ${clientChatId}.`);
                delete pendingPaymentRequests[pendingRequest];
                console.log('[DEBUG] Запрос реквизитов удален.');
            } else {
                await bot.sendMessage(chatId, 'Ошибка: не найдено активного запроса на реквизиты.');
            }
            return;
        }

        if (data.startsWith('payment_confirmed_')) {
            const clientChatId = data.split('payment_confirmed_')[1];

            await bot.sendMessage(clientChatId, 'Спасибо за подтверждение! Пожалуйста, отправьте фото или документ квитанции для проверки.');
            await bot.sendMessage(adminId, `Клиент ID ${clientChatId} подтвердил оплату. Ожидается квитанция.`);
            console.log(`[INFO] Клиент ID ${clientChatId} подтвердил оплату.`);
            return;
        }

        if (data.startsWith('delete_template_')) {
            const templateId = data.split('delete_template_')[1];
            await deleteTemplateById(templateId);
            await bot.sendMessage(chatId, 'Шаблон успешно удалён.');
            await showTemplatesKeyboard(bot, chatId);
            return;
        }

        if (data.startsWith('select_server_')) {
            const serverName = data.split('select_server_')[1];
            const selectedServer = getAvailableServers().find(server => server.name === serverName);

            if (!selectedServer) {
                await bot.sendMessage(userId, 'Ошибка выбора сервера. Попробуйте снова.');
                return;
            }

            if (userId.toString() === adminId) {
                await createAndSendKey(bot, userId, userId, selectedServer.name, selectedServer.apiUrl);
                await bot.sendMessage(userId, 'Ключ успешно создан.');
            } else {
                pendingKeyRequests[userId] = { server: selectedServer };
                await bot.sendMessage(userId, `Вы выбрали сервер "${selectedServer.name}". Ожидайте реквизитов для оплаты.`);
                await requestPaymentDetails(bot, adminId, userId, callbackQuery.from.username || `ID ${userId}`, pendingPaymentRequests);
            }
        }
        if (data.startsWith('approve_payment_')) {
            const clientChatId = data.split('approve_payment_')[1];

            // Логика для генерации ключа
            const pendingRequest = pendingKeyRequests[clientChatId];
            if (pendingRequest && pendingRequest.server) {
                const { server } = pendingRequest;

                try {
                    // Генерация и отправка ключа
                    const key = await createAndSendKey(bot, clientChatId, clientChatId, server.name, server.apiUrl);
                    await bot.sendMessage(clientChatId, `Ваш платеж подтвержден. Вот ваш ключ:\n\n${key}`);
                    await bot.sendMessage(adminId, `Платеж клиента ID ${clientChatId} подтвержден. Ключ успешно выдан.`);

                    // Удаление запроса после выдачи ключа
                    delete pendingKeyRequests[clientChatId];
                    console.log('[INFO] Запрос на ключ удален после подтверждения платежа.');
                } catch (error) {
                    console.error('[Error] Ошибка при создании ключа:', error);
                    await bot.sendMessage(adminId, `Ошибка при создании ключа для клиента ID ${clientChatId}.`);
                }
            } else {
                console.log('[Warning] Запрос на ключ не найден или сервер не указан.');
                await bot.sendMessage(adminId, `Ошибка: Запрос на ключ для клиента ID ${clientChatId} не найден.`);
            }
            return;
        }

        if (data.startsWith('decline_payment_')) {
            const clientChatId = data.split('decline_payment_')[1];
            await bot.sendMessage(clientChatId, 'Ваш платеж был отклонен. Пожалуйста, свяжитесь с администратором для уточнения.');
            await bot.sendMessage(adminId, `Платеж клиента ID ${clientChatId} отклонен.`);
            delete pendingKeyRequests[clientChatId];
            return;
        }

        if (data.startsWith('payment_confirmed_')) {
            const clientChatId = data.split('payment_confirmed_')[1];
            await bot.sendMessage(clientChatId, 'Спасибо за подтверждение! Пожалуйста, отправьте фото или документ квитанции для проверки.');
            await bot.sendMessage(adminId, `Клиент ID ${clientChatId} подтвердил оплату. Ожидается квитанция.`);
            return;
        }

    } catch (error) {
        console.error(`[Error] Ошибка callback_query:`, error);
        await bot.sendMessage(chatId, 'Произошла ошибка при обработке запроса. Попробуйте позже.');
    }
});