const axios = require('axios');
const db = require('../db');

// Функция для экранирования HTML-символов
function escapeHTML(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Функция для создания, сохранения и отправки ключа пользователю
async function createAndSendKey(bot, userId, chatId, serverName, serverApiUrl, domain) {
    console.log(`[createAndSendKey] Начало создания ключа для пользователя ID = ${userId} на сервере ${serverName}`);

    if (!userId || !chatId) {
        console.error(`[createAndSendKey] Ошибка: userId или chatId отсутствуют. userId: ${userId}, chatId: ${chatId}`);
        return null;
    }

    try {
        console.log(`[createAndSendKey] Запрос на создание нового ключа через API Outline для пользователя ID = ${userId} на сервере ${serverName}`);
        console.log(`[createAndSendKey] Используемый URL API: ${serverApiUrl}`);

        // Создаем новый ключ через API Outline
        const createResponse = await axios.post(`${serverApiUrl}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        if (!createResponse.data || !createResponse.data.id || !createResponse.data.accessUrl || !createResponse.data.port) {
            console.error('[createAndSendKey] Ошибка: API Outline не вернул необходимые данные.');
            return null;
        }

        const { id: keyId, accessUrl, port } = createResponse.data;
        console.log(`[createAndSendKey] Получен ответ от API Outline: keyId = ${keyId}, accessUrl = ${accessUrl}, port = ${port}`);

        const currentDate = new Date();
        const keyName = `User_${userId}_${currentDate.toISOString().slice(0, 10)}`;
        console.log(`[createAndSendKey] Присваиваем имя ключу: ${keyName}`);

        // Устанавливаем имя ключа через API
        await axios.put(
            `${serverApiUrl}/access-keys/${keyId}/name`,
            { name: keyName },
            { headers: { 'Content-Type': 'application/json' }, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
        );
        console.log(`[createAndSendKey] Имя ключа установлено через API`);

        // Подставляем домен сервера в ссылку доступа
        const formattedKey = `${accessUrl.replace(/@.*?:/, `@${domain}:${port}/`)}#RaphaelVPN`;
        console.log(`[createAndSendKey] Сформированный доступный ключ: ${formattedKey}`);

        // Получаем `server_id` из базы данных по имени сервера
        const serverResult = await db.query('SELECT id FROM servers WHERE name = $1', [serverName]);
        if (serverResult.rows.length === 0) {
            console.error(`[createAndSendKey] Ошибка: Сервер с именем "${serverName}" не найден в базе данных.`);
            return null;
        }
        const serverId = serverResult.rows[0].id;
        console.log(`[createAndSendKey] Найден server_id в базе данных: ${serverId}`);

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
        console.log(`[createAndSendKey] Экранированный ключ для отправки: ${escapedKey}`);

        // Отправляем ключ пользователю в формате HTML
        await bot.sendMessage(chatId, `Ваш ключ для ${serverName}:\n<code>${escapedKey}</code>`, { parse_mode: 'HTML' });
        console.log(`[createAndSendKey] Ключ успешно отправлен пользователю ID = ${userId}`);

        // Отправляем сообщение с кнопкой для копирования
        await bot.sendMessage(chatId, 'Скопируйте ключ целиком из сообщения выше', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Скопировать ✅', callback_data: 'copy_key' }]
                ]
            }
        });
        console.log(`[createAndSendKey] Сообщение с кнопкой для копирования отправлено пользователю ID = ${userId}`);

        return { formattedKey, creationDate: currentDate };
    } catch (error) {
        console.error('[createAndSendKey] Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        await bot.sendMessage(chatId, "Произошла ошибка при создании ключа. Попробуйте позже.");
        return null;
    }
}

module.exports = { createAndSendKey };