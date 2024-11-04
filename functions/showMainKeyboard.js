//showMainKeyboard.js
function showMainKeyboard(bot, chatId, isAdminUser) {
    const options = {
        reply_markup: {
            keyboard: isAdminUser
                ? [
                    [{ text: 'Создать ключ' }, { text: 'Список ключей' }],
                    [{ text: 'Список пользователей' }, { text: 'Список пользователей с ключами' }],
                    [{ text: 'Инструкция' }]
                ]
                : [
                    [{ text: 'Запросить ключ' }],
                    [{ text: 'Инструкция' }]
                ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
    bot.sendMessage(chatId, 'Выберите действие:', options);
}

module.exports = showMainKeyboard; // Экспорт функции