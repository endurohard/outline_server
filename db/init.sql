-- Создание таблицы clients
CREATE TABLE IF NOT EXISTS clients (
                                       id SERIAL PRIMARY KEY,
                                       telegram_id BIGINT NOT NULL UNIQUE,
                                       name VARCHAR(255)
    );

-- Создание таблицы keys
CREATE TABLE IF NOT EXISTS keys (
                                    id SERIAL PRIMARY KEY,
                                    user_id BIGINT NOT NULL,
                                    key_value VARCHAR(255) NOT NULL,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Пример вставки данных в таблицу keys
INSERT INTO keys (user_id, key_value) VALUES (1, 'sample_key');