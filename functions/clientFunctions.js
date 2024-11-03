// functions/clientFunctions.js
const db = require('../db'); // Подключение к базе данных должно быть пулом соединений (pg.Pool)

async function saveClient(userId, userName) {
    try {
        // Убедимся, что userId и userName корректны
        if (!userId || typeof userId !== 'number') {
            console.error(`[saveClient] Ошибка: userId должен быть числом. Получено: ${userId}`);
            return;
        }
        if (!userName || typeof userName !== 'string') {
            console.error(`[saveClient] Ошибка: userName должен быть строкой. Получено: ${userName}`);
            return;
        }

        const query = `INSERT INTO clients (telegram_id, name) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING`;
        await db.query(query, [userId, userName]);
        console.log(`[saveClient] Клиент с ID = ${userId} успешно сохранен.`);
    } catch (error) {
        console.error(`[saveClient] Ошибка записи клиента с ID = ${userId}:`, error);
    }
}

module.exports = { saveClient };