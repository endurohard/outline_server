const TelegramBot = require('node-telegram-bot-api');

function showMainKeyboard(bot, chatId, isAdminUser) {
    console.log(`Отображение клавиатуры для ${isAdminUser ? 'администратора' : 'пользователя'}`);

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
            one_time_keyboard: false // Клавиатура останется видимой
        }
    };

    // Добавляем текст сообщения перед отправкой клавиатуры
    bot.sendMessage(chatId, 'Выберите действие:', options);
}

module.exports = { showMainKeyboard };