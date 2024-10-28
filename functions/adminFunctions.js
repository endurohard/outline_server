const db = require('../db');
const { getKeysFromDatabase } = require('./getKeysFromDatabase'); // Импорт функции из файла

// Функция для проверки прав администратора
function isAdmin(userId) {
    return userId.toString() === adminId; // Сравнение userId с adminId
}

// Функция для отправки длинного сообщения частями
async function sendLongMessage(bot, chatId, message, chunkSize = 4000) {
    const messageChunks = message.match(new RegExp(`.{1,${chunkSize}}`, 'g')); // Разбивает на куски по 4000 символов
    for (const chunk of messageChunks) {
        await bot.sendMessage(chatId, chunk);
    }
}

async function getUsersWithKeys(chatId, bot) {
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

        // Проверяем, что сообщение не пустое перед отправкой
        if (message.trim()) {
            await sendLongMessage(bot, chatId, message);
        } else {
            console.warn("Сформированное сообщение пустое, отправка отменена.");
            await bot.sendMessage(chatId, 'Нет данных для отображения.');
        }

    } catch (err) {
        console.error('Ошибка получения списка пользователей с ключами:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей с ключами.');
    }
}

async function getUsers(chatId, bot) {
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

module.exports = { getUsersWithKeys, getUsers, getKeysFromDatabase };