const db = require('../db'); // Подключение к базе данных должно быть пулом соединений (pg.Pool)

async function saveClient(userId, userName) {
    console.log('[57] Вызов функции saveClient');
    console.log(`[58] Проверка параметров: userId = ${userId}, userName = ${userName}`);

    try {
        // Убедимся, что userId и userName корректны
        if (!userId || typeof userId !== 'number') {
            console.error(`[59] Ошибка: userId должен быть числом. Получено: ${userId}`);
            return;
        }
        if (!userName || typeof userName !== 'string') {
            console.error(`[60] Ошибка: userName должен быть строкой. Получено: ${userName}`);
            return;
        }

        const query = `INSERT INTO clients (telegram_id, name) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING`;
        console.log(`[61] Выполнение запроса к базе данных: ${query}`);
        await db.query(query, [userId, userName]);
        console.log(`[62] Клиент с ID = ${userId} успешно сохранен.`);
    } catch (error) {
        console.error(`[63] Ошибка записи клиента с ID = ${userId}:`, error);
    }
}

module.exports = { saveClient };