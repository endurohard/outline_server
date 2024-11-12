function showMainKeyboard(bot, chatId, isAdminUser) {
    console.log(`[INFO] Вызов showMainKeyboard: chatId=${chatId}, isAdminUser=${isAdminUser}`);

    const options = {
        reply_markup: {
            keyboard: isAdminUser
                ? [
                    [{ text: 'Создать ключ' }, { text: 'Список ключей' }],
                    [{ text: 'Список пользователей' }, { text: 'Список пользователей с ключами' }],
                    [{ text: 'Шаблоны' }, { text: 'Инструкция' }]
                ]
                : [
                    [{ text: 'Запросить ключ' }],
                    [{ text: 'Инструкция' }]
                ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };

    bot.sendMessage(chatId, 'Выберите действие:', options)
        .then(() => console.log(`[DEBUG] Клавиатура успешно отправлена пользователю ID: ${chatId}`))
        .catch(error => console.error('[ERROR] Ошибка отправки клавиатуры:', error));
}

module.exports = { showMainKeyboard };