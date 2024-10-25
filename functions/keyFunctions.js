const axios = require('axios');
const db = require('../db');

async function createNewKey(userId) {
    try {
        console.log(`Создание нового ключа для пользователя ID = ${userId}`);
        const createResponse = await axios.post(`${process.env.OUTLINE_API_URL}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        const keyId = createResponse.data.id;
        const accessUrl = createResponse.data.accessUrl;
        const serverIp = 'bestvpn.world';
        const port = createResponse.data.port;

        if (!accessUrl) {
            console.error('Ошибка: accessUrl не был получен из API.');
            return null;
        }

        const currentDate = new Date();
        const keyName = `User_${userId}_${currentDate.toISOString().slice(0, 10)}`;
        await axios.put(
            `${process.env.OUTLINE_API_URL}/access-keys/${keyId}/name`,
            { name: keyName },
            { headers: { 'Content-Type': 'application/json' }, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
        );

        const dynamicLink = accessUrl.replace(/@.*?:/, `@${serverIp}:${port}/`) + `#RaphaelVPN`;

        await db.query('INSERT INTO keys (user_id, key_value, creation_date) VALUES ($1, $2, $3)', [userId, dynamicLink, currentDate.toISOString()]);
        console.log(`Ключ для пользователя ID = ${userId} успешно записан в базу данных.`);
        return dynamicLink;
    } catch (error) {
        console.error('Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function requestNewKey(userId, chatId, userName) {
    console.log(`Пользователь ID = ${userId} запросил создание нового ключа.`);
    const requestId = Date.now();
    pendingKeyRequests[requestId] = { userId, chatId, userName };

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Подтвердить', callback_data: `confirm_${requestId}` },
                    { text: 'Отклонить', callback_data: `decline_${requestId}` }
                ]
            ]
        }
    };

    bot.sendMessage(adminId, `Пользователь с ID = ${userId} запросил создание ключа.\nПодтвердите, чтобы создать ключ.`, options);
}

module.exports = { createNewKey, requestNewKey }; // Экспортируем обе функции