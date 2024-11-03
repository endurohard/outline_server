// functions/sendLongMessage.js

async function sendLongMessage(bot, chatId, message, chunkSize = 4000) {
    const messageChunks = message.match(new RegExp(`.{1,${chunkSize}}`, 'g')); // Разбивает на куски по 4000 символов
    for (const chunk of messageChunks) {
        await bot.sendMessage(chatId, chunk);
    }
}

module.exports = sendLongMessage;