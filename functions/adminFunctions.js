const db = require('../db');
const { getKeysFromDatabase } = require('./getKeysFromDatabase'); // Импорт функции из файла
const pendingPaymentRequests = {}; // Временное хранилище для запросов реквизитов

// Функция для проверки прав администратора
function isAdmin(userId) {
    console.log('[71] Проверка прав администратора');
    return userId.toString() === process.env.ADMIN_ID; // Сравнение userId с adminId из .env
}

// Функция для отправки длинного сообщения частями
async function sendLongMessage(bot, chatId, message, chunkSize = 4000) {
    console.log('[72] Отправка длинного сообщения частями');
    const messageChunks = message.match(new RegExp(`.{1,${chunkSize}}`, 'g')); // Разбивает на куски по 4000 символов
    for (const chunk of messageChunks) {
        await bot.sendMessage(chatId, chunk);
    }
}

async function getUsersWithKeys(bot, chatId) {
    console.log(`[73] Запрос списка пользователей с ключами от администратора ID = ${chatId}`);
    try {
        const res = await db.query(`
            SELECT c.telegram_id, c.name, k.key_value, k.creation_date
            FROM clients c
                     LEFT JOIN keys k ON c.telegram_id = k.user_id
            ORDER BY c.telegram_id, k.creation_date DESC;
        `);

        console.log("[74] Результаты запроса получены:", res.rows);

        let message = 'Список пользователей с их ключами:\n';
        let currentUser = null;
        res.rows.forEach(row => {
            console.log(`[75] Обработка пользователя с ID = ${row.telegram_id}`);
            if (currentUser !== row.telegram_id) {
                currentUser = row.telegram_id;
                message += `\nTelegram ID: ${row.telegram_id}, Имя: ${row.name || 'Неизвестный'}:\n`;
            }
            const key = row.key_value !== null ? row.key_value : 'Нет ключа';
            message += `   Ключ: ${key}, Дата создания: ${row.creation_date}\n`;
        });

        if (res.rows.length === 0) {
            console.log('[76] Нет зарегистрированных пользователей');
            message = 'Нет зарегистрированных пользователей.';
        }

        if (message.trim()) {
            console.log('[77] Отправка сообщения с пользователями и ключами');
            await sendLongMessage(bot, chatId, message);
        } else {
            await bot.sendMessage(chatId, 'Нет данных для отображения.');
        }
    } catch (err) {
        console.error('[78] Ошибка получения списка пользователей с ключами:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей с ключами.');
    }
}

async function getUsers(bot, chatId) {
    console.log(`[79] Запрос списка пользователей от администратора ID = ${chatId}`);
    try {
        const res = await db.query(`SELECT * FROM clients`);
        let message = 'Список пользователей:\n';
        if (res.rows.length > 0) {
            res.rows.forEach(row => {
                console.log(`[80] Обработка пользователя с ID = ${row.id}`);
                message += `ID: ${row.id}, Имя: ${row.name}\n`;
            });
        } else {
            console.log('[81] Нет зарегистрированных пользователей');
            message = 'Нет зарегистрированных пользователей.';
        }
        await bot.sendMessage(chatId, message);
    } catch (err) {
        console.error('[82] Ошибка получения списка пользователей:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей.');
    }
}

// Функция для отправки реквизитов для оплаты
async function requestPaymentDetails(bot, chatId, clientChatId, userName) {
    console.log(`[83] Запрос реквизитов для оплаты от администратора ID = ${chatId} для пользователя ${userName}`);
    pendingPaymentRequests[chatId] = { clientChatId, userName };
    await bot.sendMessage(chatId, `Пожалуйста, отправьте реквизиты для оплаты для @${userName}`);
}

// Обработчик текстовых сообщений от администратора для отправки реквизитов
async function handleAdminPaymentMessage(bot, msg) {
    console.log(`[84] Обработка сообщения администратора с реквизитами для оплаты ID = ${msg.from.id}`);
    const adminId = msg.from.id;
    const paymentRequest = pendingPaymentRequests[adminId];
    if (!paymentRequest) {
        console.log('[85] Запрос на реквизиты для оплаты не найден');
        return;
    }

    const { clientChatId, userName } = paymentRequest;
    const paymentDetails = msg.text;

    console.log(`[86] Отправка реквизитов для оплаты пользователю ID = ${clientChatId}`);
    await bot.sendMessage(clientChatId, `Пожалуйста, произведите оплату. Реквизиты от администратора:\n${paymentDetails}`);
    delete pendingPaymentRequests[adminId];
    console.log('[87] Запрос на реквизиты для оплаты завершен и удален');
}

module.exports = { getUsersWithKeys, getUsers, getKeysFromDatabase, requestPaymentDetails, handleAdminPaymentMessage };