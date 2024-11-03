-- Создание таблицы clients для хранения информации о клиентах
CREATE TABLE IF NOT EXISTS clients (
                                       id SERIAL PRIMARY KEY,
                                       telegram_id BIGINT NOT NULL UNIQUE,
                                       name VARCHAR(255)
    );

-- Создание таблицы servers для хранения информации о серверах
CREATE TABLE IF NOT EXISTS servers (
                                       id SERIAL PRIMARY KEY,
                                       name VARCHAR(50) NOT NULL UNIQUE,
    api_url VARCHAR(255) NOT NULL
    );

-- Создание таблицы keys для хранения ключей доступа, связанных с пользователями и серверами
CREATE TABLE IF NOT EXISTS keys (
                                    id SERIAL PRIMARY KEY,
                                    user_id BIGINT NOT NULL REFERENCES clients(telegram_id) ON DELETE CASCADE,
    server_id INT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    key_value VARCHAR(255) NOT NULL,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiration_date TIMESTAMP  -- Новый столбец для хранения даты истечения ключа
    );

-- Создание таблицы key_requests для отслеживания запросов на создание ключей
CREATE TABLE IF NOT EXISTS key_requests (
                                            request_id SERIAL PRIMARY KEY,
                                            user_id BIGINT NOT NULL REFERENCES clients(telegram_id) ON DELETE CASCADE,
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending'
    );

-- Создание таблицы admins для хранения информации об администраторах
CREATE TABLE IF NOT EXISTS admins (
                                      id SERIAL PRIMARY KEY,
                                      telegram_id BIGINT NOT NULL UNIQUE,
                                      name VARCHAR(255)
    );