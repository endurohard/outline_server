const db = require('../db');

async function sendLongMessage(bot, chatId, message) {
    const maxMessageLength = 4096; // Максимальная длина сообщения в Telegram
    let start = 0;

    while (start < message.length) {
        const chunk = message.slice(start, start + maxMessageLength);
        await bot.sendMessage(chatId, chunk);
        start += maxMessageLength;
    }
}

async function getKeysFromDatabase(chatId, bot) {
    try {
        const res = await db.query(`SELECT * FROM keys ORDER BY creation_date DESC`);

        if (res.rows.length === 0) {
            return await bot.sendMessage(chatId, 'Ключи не найдены.');
        }

        let message = 'Список всех ключей:\n';
        res.rows.forEach(row => {
            message += `ID: ${row.id}, Пользователь ID: ${row.user_id}, Ключ: ${row.key_value}, Дата создания: ${row.creation_date}\n`;
        });

        // Отправляем сообщение частями
        await sendLongMessage(bot, chatId, message);

    } catch (err) {
        console.error('Ошибка при получении списка ключей:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
}

module.exports = { getKeysFromDatabase };