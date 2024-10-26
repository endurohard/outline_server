const TelegramBot = require('node-telegram-bot-api');

function showMainKeyboard(bot, chatId, isAdminUser) {
    const options = isAdminUser
        ? {
            reply_markup: {
                keyboard: [
                    [{ text: 'Старт' }],
                    [{ text: 'Создать ключ' }, { text: 'Список ключей' }],
                    [{ text: 'Список пользователей' }, { text: 'Список пользователей с ключами' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        }
        : {
            reply_markup: {
                keyboard: [
                    [{ text: 'Запросить ключ' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        };

    bot.sendMessage(chatId, 'Выберите действие:', options);
}

module.exports = { showMainKeyboard };