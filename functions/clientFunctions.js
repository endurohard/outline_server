const db = require('../db');

async function saveClient(userId, userName) {
    try {
        await db.query(
            'INSERT INTO clients (telegram_id, name) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
            [userId, userName]
        );
        console.log(`Клиент с ID = ${userId} успешно записан в базу данных.`);
    } catch (err) {
        console.error(`Ошибка записи клиента с ID = ${userId}:`, err);
    }
}

module.exports = { saveClient };