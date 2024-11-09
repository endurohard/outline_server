async function sendLongMessage(bot, chatId, message, chunkSize = 4000) {
    if (!bot || !chatId) {
        console.error('[ERROR] Bot или chatId не определены');
        return;
    }

    const messageChunks = message.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];
    console.log(`[52] chatId: ${chatId}, длина сообщения: ${message.length}, количество чанков: ${messageChunks.length}`);

    for (let i = 0; i < messageChunks.length; i++) {
        try {
            await bot.sendMessage(chatId, messageChunks[i]);
            console.log(`[54] Успешно отправлен чанк ${i + 1} из ${messageChunks.length}`);
        } catch (error) {
            console.error(`[56] Ошибка при отправке чанка ${i + 1}:`, error);
        }
    }
}

module.exports = sendLongMessage;