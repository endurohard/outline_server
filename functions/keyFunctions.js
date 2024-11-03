const axios = require('axios');
const db = require('../db');

// Функция для экранирования HTML-символов
function escapeHTML(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Функция для создания, сохранения и отправки ключа пользователю
async function createAndSendKey(bot, userId, chatId, serverId, serverApiUrl, serverName, domain) {
    if (!userId || !chatId) {
        console.log(`[createAndSendKey] Запрос на создание ключа для пользователя ${userId} на сервере ${serverName}`);
        console.error(`[createAndSendKey] Ошибка: userId или chatId отсутствуют. userId: ${userId}, chatId: ${chatId}`);
        return null;
    }

    try {
        console.log(`[createAndSendKey] Создание нового ключа через API Outline для пользователя ${userId}`);

        const createResponse = await axios.post(`${serverApiUrl}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        console.log(`[createAndSendKey] Ответ от API на создание ключа:`, createResponse.data);

        if (!createResponse.data || !createResponse.data.id || !createResponse.data.accessUrl || !createResponse.data.port) {
            console.error('[createAndSendKey] Ошибка: API Outline не вернул необходимые данные.');
            return null;
        }

        const { id: keyId, accessUrl, port } = createResponse.data;
        const currentDate = new Date();
        const keyName = `User_${userId}_${currentDate.toISOString().slice(0, 10)}`;

        // Устанавливаем имя ключа через API
        await axios.put(
            `${serverApiUrl}/access-keys/${keyId}/name`,
            { name: keyName },
            { headers: { 'Content-Type': 'application/json' }, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
        );

        // Подставляем домен сервера в ссылку доступа
        const formattedKey = `${accessUrl.replace(/@.*?:/, `@${domain}:${port}/`)}#RaphaelVPN`;

        // Сохраняем ключ в базе данных
        const insertResult = await db.query(
            `INSERT INTO keys (user_id, server_id, key_value, creation_date) VALUES ($1, $2, $3, $4) RETURNING *`,
            [userId, serverId, formattedKey, currentDate]
        );

        if (insertResult.rowCount === 0) {
            console.error(`[createAndSendKey] Ошибка: не удалось сохранить ключ в базе данных для пользователя ID = ${userId}`);
            return null;
        }

        console.log(`[createAndSendKey] Ключ для пользователя ID = ${userId} успешно создан и сохранен в базе данных.`);

        // Экранируем ключ для HTML
        const escapedKey = escapeHTML(formattedKey);

        // Отправляем ключ пользователю в формате HTML
        await bot.sendMessage(chatId, `Ваш ключ для ${serverName}:\n<code>${escapedKey}</code>`, { parse_mode: 'HTML' });

        await bot.sendMessage(chatId, 'Скопируйте ключ целиком из сообщения выше', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Скопировать ✅', callback_data: 'copy_key' }]
                ]
            }
        });

        return { formattedKey, creationDate: currentDate };
    } catch (error) {
        console.error('[createAndSendKey] Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
    }
}

module.exports = { createAndSendKey };