const db = require('../db');
const sendLongMessage = require('./sendLongMessage');

// Функция для получения списка ключей и отправки администратору
async function getKeysFromDatabase(bot, chatId) {
    console.log('[64] Вызов функции getKeysFromDatabase');

    try {
        console.log('[65] Выполнение запроса к базе данных для получения списка ключей');
        const res = await db.query(`
            SELECT k.id, k.user_id, k.key_value, k.creation_date, s.name AS server_name
            FROM keys k
                     LEFT JOIN servers s ON k.server_id = s.id
            ORDER BY k.creation_date DESC;
        `);

        if (res.rows.length === 0) {
            console.log('[66] Ключи не найдены в базе данных');
            await bot.sendMessage(chatId, 'Ключи не найдены.');
            return;
        }

        console.log(`[67] Получено ${res.rows.length} ключей из базы данных`);

        let message = 'Список всех ключей:\n';
        res.rows.forEach((row, index) => {
            console.log(`[68] Обработка ключа с ID: ${row.id}, индекс в массиве: ${index}`);
            const domain = row.key_value && row.key_value.includes('bestvpn.world')
                ? `${row.server_name ? row.server_name.toLowerCase() : 'unknown'}.bestvpn.world`
                : 'bestvpn.world';
            const formattedKey = row.key_value
                ? row.key_value.replace(/@[^:]+:/, `@${domain}:`)
                : 'неизвестный ключ';

            message += `ID: ${row.id}, Пользователь ID: ${row.user_id}, Ключ: ${formattedKey}, Дата создания: ${row.creation_date || 'неизвестная дата'}\n`;
        });

        console.log('[69] Отправка длинного сообщения с ключами администратору');
        // Отправляем сообщение частями, если оно длинное
        await sendLongMessage(bot, chatId, message);

    } catch (err) {
        console.error('[70] Ошибка при получении списка ключей:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
}

module.exports = getKeysFromDatabase;