const db = require('../db');
const sendLongMessage = require('./sendLongMessage');

// Функция для получения списка ключей и отправки администратору
async function getKeysFromDatabase(bot, chatId) {
    try {
        const res = await db.query(`
            SELECT k.id, k.user_id, k.key_value, k.creation_date, s.name AS server_name
            FROM keys k
                     LEFT JOIN servers s ON k.server_id = s.id
            ORDER BY k.creation_date DESC;
        `);

        if (res.rows.length === 0) {
            await bot.sendMessage(chatId, 'Ключи не найдены.');
            return;
        }

        let message = 'Список всех ключей:\n';
        res.rows.forEach(row => {
            const domain = row.key_value && row.key_value.includes('bestvpn.world')
                ? `${row.server_name ? row.server_name.toLowerCase() : 'unknown'}.bestvpn.world`
                : 'bestvpn.world';
            const formattedKey = row.key_value
                ? row.key_value.replace(/@[^:]+:/, `@${domain}:`)
                : 'неизвестный ключ';

            message += `ID: ${row.id}, Пользователь ID: ${row.user_id}, Ключ: ${formattedKey}, Дата создания: ${row.creation_date || 'неизвестная дата'}\n`;
        });

        // Отправляем сообщение частями, если оно длинное
        await sendLongMessage(bot, chatId, message);

    } catch (err) {
        console.error('Ошибка при получении списка ключей:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
}

module.exports = getKeysFromDatabase;