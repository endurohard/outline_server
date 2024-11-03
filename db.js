const { Pool } = require('pg'); // Используем только Pool
const dbConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_NAME,
};

const db = new Pool(dbConfig); // Создаем пул соединений

// Логирование ошибок пула
db.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// Экспортируем пул соединений для использования в других модулях
module.exports = db;