const axios = require('axios');
const db = require('../db');

console.log('[0] Файл keyFunctions.js загружен');

// Функция для экранирования HTML-символов
function escapeHTML(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Функция для создания, сохранения и отправки ключа пользователю
async function createAndSendKey(bot, userId, chatId, serverName, serverApiUrl, domain, adminId) {
    console.log(`[22] [createAndSendKey] Начало создания ключа для пользователя ID = ${userId} на сервере ${serverName}`);

    if (!userId || !chatId) {
        console.error(`[23] [createAndSendKey] Ошибка: userId или chatId отсутствуют. userId: ${userId}, chatId: ${chatId}`);
        return null;
    }

    try {
        console.log(`[24] [createAndSendKey] Запрос на создание нового ключа через API Outline для пользователя ID = ${userId} на сервере ${serverName}`);
        console.log(`[25] [createAndSendKey] Используемый URL API: ${serverApiUrl}`);

        // Создаем новый ключ через API Outline
        const createResponse = await axios.post(`${serverApiUrl}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        if (!createResponse.data || !createResponse.data.id || !createResponse.data.accessUrl || !createResponse.data.port) {
            console.error('[26] [createAndSendKey] Ошибка: API Outline не вернул необходимые данные.');
            return null;
        }

        const { id: keyId, accessUrl, port } = createResponse.data;
        console.log(`[27] [createAndSendKey] Получен ответ от API Outline: keyId = ${keyId}, accessUrl = ${accessUrl}, port = ${port}`);

        const currentDate = new Date();
        const keyName = `User_${userId}_${currentDate.toISOString().slice(0, 10)}`;
        console.log(`[28] [createAndSendKey] Присваиваем имя ключу: ${keyName}`);

        // Устанавливаем имя ключа через API
        await axios.put(
            `${serverApiUrl}/access-keys/${keyId}/name`,
            { name: keyName },
            { headers: { 'Content-Type': 'application/json' }, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
        );
        console.log(`[29] [createAndSendKey] Имя ключа установлено через API`);

        // Подставляем домен сервера в ссылку доступа
        const formattedKey = `${accessUrl.replace(/@.*?:/, `@${domain}:${port}/`)}#RaphaelVPN`;
        console.log(`[30] [createAndSendKey] Сформированный доступный ключ: ${formattedKey}`);

        // Получаем `server_id` из базы данных по имени сервера
        const serverResult = await db.query('SELECT id FROM servers WHERE name = $1', [serverName]);
        if (serverResult.rows.length === 0) {
            console.error(`[31] [createAndSendKey] Ошибка: Сервер с именем "${serverName}" не найден в базе данных.`);
            return null;
        }
        const serverId = serverResult.rows[0].id;
        console.log(`[32] [createAndSendKey] Найден server_id в базе данных: ${serverId}`);

        // Сохраняем ключ в базе данных
        const insertResult = await db.query(
            `INSERT INTO keys (user_id, server_id, key_value, creation_date) VALUES ($1, $2, $3, $4) RETURNING *`,
            [userId, serverId, formattedKey, currentDate]
        );

        if (insertResult.rowCount === 0) {
            console.error(`[33] [createAndSendKey] Ошибка: не удалось сохранить ключ в базе данных для пользователя ID = ${userId}`);
            return null;
        }
        console.log(`[34] [createAndSendKey] Ключ для пользователя ID = ${userId} успешно создан и сохранен в базе данных.`);

        if (adminId) {
            await bot.sendMessage(adminId, `Ключ успешно создан для пользователя ID ${userId} на сервере "${serverName}".`);
            console.log(`[35] [createAndSendKey] Уведомление отправлено администратору ID = ${adminId}`);
        }

        // Экранируем ключ для HTML
        const escapedKey = escapeHTML(formattedKey);
        console.log(`[36] [createAndSendKey] Экранированный ключ для отправки: ${escapedKey}`);

        // Отправляем ключ пользователю в формате HTML
        await bot.sendMessage(chatId, `Ваш ключ для ${serverName}:\n<code>${escapedKey}</code>`, { parse_mode: 'HTML' });
        console.log(`[37] [createAndSendKey] Ключ успешно отправлен пользователю ID = ${userId}`);

        // Отправляем сообщение с кнопкой для копирования
        await bot.sendMessage(chatId, 'Скопируйте ключ целиком из сообщения выше', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Скопировать ✅', callback_data: 'copy_key' }]
                ]
            }
        });
        console.log(`[38] [createAndSendKey] Сообщение с кнопкой для копирования отправлено пользователю ID = ${userId}`);

        // Уведомляем администратора о создании ключа
        if (adminId) {
            await bot.sendMessage(adminId, `Ключ успешно создан для пользователя ID ${userId} на сервере "${serverName}".`);
            console.log(`[39] [createAndSendKey] Уведомление отправлено администратору ID = ${adminId}`);
        }

        return { formattedKey, creationDate: currentDate };
    } catch (error) {
        console.error('[40] [createAndSendKey] Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        await bot.sendMessage(chatId, "Произошла ошибка при создании ключа. Попробуйте позже.");
        return null;
    }
}

module.exports = { createAndSendKey };