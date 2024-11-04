async function sendLongMessage(bot, chatId, message, chunkSize = 4000) {
    console.log('[51] Вызов функции sendLongMessage');
    console.log(`[52] chatId: ${chatId}, длина сообщения: ${message.length}, размер чанка: ${chunkSize}`);

    const messageChunks = message.match(new RegExp(`.{1,${chunkSize}}`, 'g')); // Разбивает на куски по 4000 символов
    console.log(`[53] Количество чанков для отправки: ${messageChunks.length}`);

    for (const [index, chunk] of messageChunks.entries()) {
        console.log(`[54] Отправка чанка ${index + 1} из ${messageChunks.length}`);
        try {
            await bot.sendMessage(chatId, chunk);
            console.log(`[55] Чанк ${index + 1} отправлен успешно`);
        } catch (error) {
            console.error(`[56] Ошибка при отправке чанка ${index + 1}:`, error);
        }
    }
}

module.exports = sendLongMessage;