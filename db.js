const { Client } = require('pg'); // Импортируем клиент PostgreSQL

const dbConfig = {
    host: process.env.POSTGRES_HOST || 'localhost', // Хост базы данных
    port: process.env.POSTGRES_PORT || 5432, // Порт базы данных
    user: process.env.POSTGRES_USER, // Имя пользователя
    password: process.env.POSTGRES_PASSWORD, // Пароль
    database: process.env.POSTGRES_NAME, // Имя базы данных
};

const db = new Client(dbConfig);

// Подключение к базе данных
db.connect()
    .then(() => console.log("Подключение к PostgreSQL успешно!"))
    .catch(err => console.error("Ошибка подключения к PostgreSQL:", err));

module.exports = db; // Экспортируем подключение к базе данных