function showMainKeyboard(bot, chatId, isAdminUser) {
    console.log('[46] Вызов функции showMainKeyboard');
    console.log(`[47] chatId: ${chatId}, isAdminUser: ${isAdminUser}`);

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

    console.log('[48] Опции клавиатуры сформированы:', options);

    bot.sendMessage(chatId, 'Выберите действие:', options)
        .then(() => console.log('[49] Сообщение с клавиатурой успешно отправлено'))
        .catch(error => console.error('[50] Ошибка при отправке сообщения с клавиатурой:', error));
}

module.exports = showMainKeyboard;