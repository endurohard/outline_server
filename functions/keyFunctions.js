const axios = require('axios');
const db = require('../db'); // Подключаем модуль для работы с базой данных

async function requestNewKey(bot, userId, chatId, userName, adminId, pendingKeyRequests) {
    console.log(`Пользователь ID = ${userId} запросил новый ключ.`);
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

    await bot.sendMessage(adminId, `Пользователь ID = ${userId} запросил ключ. Подтвердите создание.`, options);
}

// Создание ключа и отправка пользователю
async function createNewKey(bot, userId, chatId) {
    if (!userId || !chatId) {
        console.error(`[createNewKey] Ошибка: userId или chatId отсутствуют. userId: ${userId}, chatId: ${chatId}`);
        return null;
    }

    try {
        console.log(`Создание нового ключа для пользователя ID = ${userId}`);

        // Создаем новый ключ через API Outline
        const createResponse = await axios.post(`${process.env.OUTLINE_API_URL}/access-keys`, {}, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,  // 10 секунд
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        // Проверка, что createResponse.data содержит нужные поля
        if (!createResponse.data || !createResponse.data.id || !createResponse.data.accessUrl || !createResponse.data.port) {
            console.error('Ошибка: API Outline не вернул необходимые данные.');
            return null;
        }

        const { id: keyId, accessUrl, port } = createResponse.data;
        const serverIp = 'bestvpn.world';

        const currentDate = new Date();
        const keyName = `User_${userId}_${currentDate.toISOString().slice(0, 10)}`;

        // Устанавливаем имя для ключа через API
        await axios.put(
            `${process.env.OUTLINE_API_URL}/access-keys/${keyId}/name`,
            { name: keyName },
            { headers: { 'Content-Type': 'application/json' }, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
        );

        // Форматируем ключ как URL с заменой хоста на serverIp
        const formattedKey = `${accessUrl.replace(/@.*?:/, `@${serverIp}:${port}/`)}#RaphaelVPN`;

        // Записываем ключ и дату создания в базу данных
        const insertResult = await db.query(
            `INSERT INTO keys (user_id, key_value, creation_date) VALUES ($1, $2, $3) RETURNING *`,
            [userId, formattedKey, currentDate]
        );

        if (insertResult.rowCount === 0) {
            console.error(`Ошибка: не удалось сохранить ключ в базе данных для пользователя ID = ${userId}`);
            return null;
        }

        console.log(`Ключ для пользователя ID = ${userId} успешно создан и сохранен в базе данных.`);

        // Отправка сообщения с ключом
        await bot.sendMessage(chatId, `Ваш ключ: ${formattedKey}`);
        await bot.sendMessage(chatId, 'Скопируйте ключ целиком из сообщения выше', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Скопировать ✅', callback_data: 'copy_key' }]
                ]
            }
        });

        return { formattedKey, creationDate: currentDate };
    } catch (error) {
        console.error('Ошибка при создании нового ключа Outline:', error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = { requestNewKey, createNewKey };