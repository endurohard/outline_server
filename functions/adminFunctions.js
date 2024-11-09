const db = require('../db');
const { getKeysFromDatabase } = require('./getKeysFromDatabase');

// Функция для проверки прав администратора
function isAdmin(userId) {
    console.log('[71] Проверка прав администратора');
    return userId.toString() === process.env.ADMIN_ID; // Сравнение userId с adminId из .env
}

// Функция для отправки длинного сообщения частями
async function sendLongMessage(bot, chatId, message, chunkSize = 4000) {
    console.log('[72] Отправка длинного сообщения частями');
    const messageChunks = message.match(new RegExp(`.{1,${chunkSize}}`, 'g')); // Разбивает на куски по 4000 символов
    for (const chunk of messageChunks) {
        await bot.sendMessage(chatId, chunk);
    }
}

// Использование функции
async function fetchAndSendKeys(bot, chatId) {
    const keys = await getKeysFromDatabase(db);
    // Обработка и отправка ключей
}

// Функция для получения списка пользователей с их ключами
async function getUsersWithKeys(bot, chatId) {
    console.log(`[73] Запрос списка пользователей с ключами от администратора ID = ${chatId}`);
    try {
        const res = await db.query(`
            SELECT c.telegram_id, c.name, k.key_value, k.creation_date
            FROM clients c
                     LEFT JOIN keys k ON c.telegram_id = k.user_id
            ORDER BY c.telegram_id, k.creation_date DESC;
        `);

        console.log("[74] Результаты запроса получены:", res.rows);

        let message = 'Список пользователей с их ключами:\n';
        let currentUser = null;
        res.rows.forEach(row => {
            console.log(`[75] Обработка пользователя с ID = ${row.telegram_id}`);
            if (currentUser !== row.telegram_id) {
                currentUser = row.telegram_id;
                message += `\nTelegram ID: ${row.telegram_id}, Имя: ${row.name || 'Неизвестный'}:\n`;
            }
            const key = row.key_value !== null ? row.key_value : 'Нет ключа';
            message += `   Ключ: ${key}, Дата создания: ${row.creation_date}\n`;
        });

        if (res.rows.length === 0) {
            console.log('[76] Нет зарегистрированных пользователей');
            message = 'Нет зарегистрированных пользователей.';
        }

        if (message.trim()) {
            console.log('[77] Отправка сообщения с пользователями и ключами');
            await sendLongMessage(bot, chatId, message);
        } else {
            await bot.sendMessage(chatId, 'Нет данных для отображения.');
        }
    } catch (err) {
        console.error('[78] Ошибка получения списка пользователей с ключами:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей с ключами.');
    }
}

// Функция для получения списка всех пользователей
async function getUsers(bot, chatId) {
    console.log(`[79] Запрос списка пользователей от администратора ID = ${chatId}`);
    try {
        const res = await db.query(`SELECT * FROM clients`);
        let message = 'Список пользователей:\n';
        if (res.rows.length > 0) {
            res.rows.forEach(row => {
                console.log(`[80] Обработка пользователя с ID = ${row.id}`);
                message += `ID: ${row.id}, Имя: ${row.name}\n`;
            });
        } else {
            console.log('[81] Нет зарегистрированных пользователей');
            message = 'Нет зарегистрированных пользователей.';
        }
        await bot.sendMessage(chatId, message);
    } catch (err) {
        console.error('[82] Ошибка получения списка пользователей:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка пользователей.');
    }
}

// Функция для запроса реквизитов для оплаты
async function requestPaymentDetails(bot, adminChatId, clientChatId, userName, pendingPaymentRequests) {
    const requestKey = `${adminChatId}_${clientChatId}`;
    console.log(`[83] Запрос реквизитов для оплаты от администратора ID = ${adminChatId} для пользователя ID ${clientChatId}`);

    // Добавляем запрос на оплату в pendingPaymentRequests с уникальным ключом
    pendingPaymentRequests[requestKey] = { clientChatId, userName };
    console.log('[DEBUG] pendingPaymentRequests после добавления запроса:', JSON.stringify(pendingPaymentRequests, null, 2));

    // Отправка сообщения администратору с просьбой отправить реквизиты
    await bot.sendMessage(adminChatId, `Пожалуйста, отправьте реквизиты для оплаты для @${userName}`);
}

async function handleAdminPaymentMessage(bot, msg, pendingPaymentRequests) {
    try {
        const adminId = msg.from.id;
        const command = msg.text?.trim().toLowerCase();

        if (!command || command.startsWith('/')) {
            console.log(`[DEBUG] Команда "${command}" не обрабатывается как платежное сообщение.`);
            return;
        }

        const requestKey = Object.keys(pendingPaymentRequests).find(key => key.startsWith(`${adminId}_`));
        const paymentRequest = pendingPaymentRequests[requestKey];

        if (!paymentRequest) {
            console.log(`[DEBUG] Запрос на реквизиты для оплаты не найден`);
            return;
        }

        const { clientChatId } = paymentRequest;
        await bot.sendMessage(clientChatId, `Пожалуйста, произведите оплату. Реквизиты:\n${msg.text}`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Оплатил', callback_data: `payment_confirmed_${clientChatId}` }]
                ]
            }
        });

        console.log(`[DEBUG] Запрос на реквизиты для оплаты завершен и удален`);
        delete pendingPaymentRequests[requestKey];
    } catch (error) {
        console.error(`[Error] Ошибка обработки платежного сообщения:`, error);
    }
}

async function forwardReceipt(bot, msg, userId, adminId) {
    try {
        const fileId = msg.photo?.[msg.photo.length - 1]?.file_id;

        if (!fileId) {
            throw new Error('Не удалось получить file_id из фото.');
        }

        await bot.sendPhoto(adminId, fileId, {
            caption: `Клиент ID ${userId} отправил квитанцию об оплате.`
        });

        await bot.sendMessage(adminId, `Подтвердите или отклоните платеж для клиента ID ${userId}:`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Подтвердить оплату', callback_data: `approve_payment_${userId}` }],
                    [{ text: 'Отклонить оплату', callback_data: `decline_payment_${userId}` }]
                ]
            }
        });

        console.log(`[INFO] Квитанция от клиента ID ${userId} переслана админу ID ${adminId}`);
    } catch (error) {
        console.error(`[Error] Ошибка пересылки квитанции от клиента ID ${userId}:`, error);
        await bot.sendMessage(userId, 'Произошла ошибка при отправке квитанции. Пожалуйста, попробуйте позже.');
    }
}


// Экспортируем функцию
module.exports = { getUsersWithKeys, getUsers, forwardReceipt, getKeysFromDatabase, requestPaymentDetails, handleAdminPaymentMessage };