const getServersFromEnv = require('./functions/generateServers');

async function insertServersFromEnv(db) {
    const servers = getServersFromEnv();

    for (const server of servers) {
        try {
            await db.query(
                `INSERT INTO servers (id, name, api_url) VALUES ($1, $2, $3)
                    ON CONFLICT (id) DO NOTHING`,
                [server.id, server.name, server.apiUrl]
            );
            console.log(`[Database] Сервер "${server.name}" с ID "${server.id}" добавлен в базу данных.`);
        } catch (error) {
            console.error(`[Database] Ошибка при добавлении сервера "${server.name}":`, error);
        }
    }
}

async function initializeDatabase(db) {
    const createClientsTable = `
        CREATE TABLE IF NOT EXISTS clients (
                                               id SERIAL PRIMARY KEY,
                                               telegram_id BIGINT NOT NULL UNIQUE,
                                               name VARCHAR(255)
            );
    `;

    const createServersTable = `
        CREATE TABLE IF NOT EXISTS servers (
                                               id INT PRIMARY KEY,
                                               name VARCHAR(50) NOT NULL UNIQUE,
            api_url VARCHAR(255) NOT NULL
            );
    `;

    const createKeysTable = `
        CREATE TABLE IF NOT EXISTS keys (
                                            id SERIAL PRIMARY KEY,
                                            user_id BIGINT NOT NULL REFERENCES clients(telegram_id) ON DELETE CASCADE,
            server_id INT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
            key_value VARCHAR(255) NOT NULL,
            creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expiration_date TIMESTAMP
            );
    `;

    const createTemplatesTable = `
        CREATE TABLE IF NOT EXISTS templates (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            details TEXT NOT NULL
        );
    `;

    const createLogsTable = `
        CREATE TABLE IF NOT EXISTS logs (
            id SERIAL PRIMARY KEY,
            action TEXT NOT NULL,
            user_id BIGINT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        await db.query(createClientsTable);
        await db.query(createServersTable);
        await db.query(createKeysTable);
        await db.query(createTemplatesTable);
        await db.query(createLogsTable);

        console.log("[Database] Таблицы успешно созданы или уже существуют.");

        // Вставка серверов из env
        await insertServersFromEnv(db);
        console.log("[Database] Серверы из .env добавлены или уже существуют.");
    } catch (error) {
        console.error("[Database] Ошибка при создании таблиц или вставке серверов:", error);
        throw error;
    }
}

module.exports = initializeDatabase;