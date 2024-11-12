async function createKey(db, userId, serverId, keyValue, expirationDate) {
    const creationDate = new Date();

    try {
        const result = await db.query(
            `INSERT INTO keys (user_id, server_id, key_value, creation_date, expiration_date)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, creation_date, expiration_date`,
            [userId, serverId, keyValue, creationDate, expirationDate]
        );

        console.log('[INFO] Ключ успешно создан:', result.rows[0]);
        return result.rows[0];
    } catch (error) {
        console.error('[ERROR] Ошибка при создании ключа:', error);
        throw error;
    }
}