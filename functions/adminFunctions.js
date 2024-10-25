const db = require('../db'); // Предположим, что у вас есть модуль для работы с БД

async function getUsersWithKeys(chatId) {
    console.log(`Запрос списка пользователей с ключами от администратора ID = ${chatId}`);
    try {
        const res = await db.query(`
            SELECT c.id, c.name, k.key_value
            FROM clients c
            LEFT JOIN keys k ON c.telegram_id = k.user_id
        `);

        let message = 'Список пользователей с их ключами:\n';
        if (res.rows.length > 0) {
            res.rows.forEach(row => {
                message += `ID: ${row.id}, Имя: ${row.name}, Ключ: ${row.key_value || 'Нет ключа'}\n`;
            });
        } else {
            message = 'Нет зарегистрированных пользователей.';
        }
        await sendLongMessage(chatId, message);
    } catch (err) {
        console.error('Ошибка получения списка пользователей с ключами:', err);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей с ключами.');
    }
}

module.exports = { getUsersWithKeys };