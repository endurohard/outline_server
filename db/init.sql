echo "CREATE TABLE IF NOT EXISTS keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    key_value VARCHAR(255) NOT NULL,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO keys (user_id, key_value) VALUES (1, 'sample_key');" > init.sql