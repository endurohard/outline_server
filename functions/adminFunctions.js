const db = require('../db');
const { getKeysFromDatabase } = require('./getKeysFromDatabase'); // Импорт функции из файла
const pendingPaymentRequests = {}; // Временное хранилище для запросов реквизитов

// Функция для проверки прав администратора
function isAdmin(userId) {
    return userId.toString() === process.env.ADMIN_ID; // Сравнение userId с adminId из .env
}

// Функция для отправки длинного сообщения частями
async function sendLongMessage(bot, chatId, message, chunkSize = 4000) {
    const messageChunks = message.match(new RegExp(`.{1,${chunkSize}}`, 'g')); // Разбивает на куски по 4000 символов
    for (const chunk of messageChunks) {
        await bot.sendMessage(chatId, chunk);
    }
}

async function getUsersWithKeys(bot, chatId) {
    console.log(`Запрос списка пользователей с ключами от администратора ID = ${chatId}`);
    try {
        const res = await db.query(`
            SELECT c.telegram_id, c.name, k.key_value, k.creation_date
            FROM clients c
                     LEFT JOIN keys k ON c.telegram_id = k.user_id
            ORDER BY c.telegram_id, k.creation_date DESC;
        `);

        console.log("Результаты запроса:", res.rows);

        let message = 'Список пользователей с их ключами:\n';
        let currentUser = null;
        res.rows.forEach(row => {
            if (currentUser !== row.telegram_id) {
                currentUser = row.telegram_id;
                message += `\nTelegram ID: ${row.telegram_id}, Имя: ${row.name || 'Неизвестный'}:\n`;
            }
            const key = row.key_value !== null ? row.key_value : 'Нет ключа';
            message += `   Ключ: ${key}, Дата создания: ${row.creation_date}\n`;
        });

        if (res.rows.length === 0) {
            message = 'Нет зарегистрированных пользователей.';
        }

        if (message.trim()) {
            await sendLongMessage(bot, chatId, message);
        } else {
            await bot.sendMessage(chatId, 'Нет данных для отображения.');
        }
    } catch (err) {
        console.error('Ошибка получения списка пользователей с ключами:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей с ключами.');
    }
}

async function getUsers(bot, chatId) {
    console.log(`Запрос списка пользователей от администратора ID = ${chatId}`);
    try {
        const res = await db.query(`SELECT * FROM clients`);
        let message = 'Список пользователей:\n';
        if (res.rows.length > 0) {
            res.rows.forEach(row => {
                message += `ID: ${row.id}, Имя: ${row.name}\n`;
            });
        } else {
            message = 'Нет зарегистрированных пользователей.';
        }
        await bot.sendMessage(chatId, message);
    } catch (err) {
        console.error('Ошибка получения списка пользователей:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей.');
    }
}

// Функция для отправки реквизитов для оплаты
async function requestPaymentDetails(bot, chatId, clientChatId, userName) {
    pendingPaymentRequests[chatId] = clientChatId; // Сохраняем ID чата клиента для админа
    await bot.sendMessage(chatId, `Пожалуйста, отправьте реквизиты для оплаты для @${userName}`);
}

// Обработчик текстовых сообщений от администратора для отправки реквизитов
async function handleAdminPaymentMessage(bot, msg) {
    const adminId = msg.from.id;
    const paymentRequest = pendingPaymentRequests[adminId];
    if (!paymentRequest) return;

    const { clientChatId, userName } = paymentRequest;
    const paymentDetails = msg.text;

    await bot.sendMessage(clientChatId, `Пожалуйста, произведите оплату. Реквизиты от администратора:\n${paymentDetails}`);
    delete pendingPaymentRequests[adminId];
}

module.exports = { getUsersWithKeys, getUsers, getKeysFromDatabase, requestPaymentDetails, handleAdminPaymentMessage };