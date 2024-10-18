const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Telegram bot setup
const token = 'YOUR_TELEGRAM_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });

// Outline server config
const OUTLINE_SERVER = 'https://node1.users.outline.yourvpn.io';
const OUTLINE_API = '/access-keys';
const OUTLINE_USERS_GATEWAY = 'ssconf://users.outline.yourvpn.io';
const OUTLINE_SALT = 'qwerty123';
const CONN_NAME = 'Wow!';

// Helper function to create a new Outline key
async function createNewKey(user_id) {
    try {
        // Step 1: Create the key
        const createResponse = await axios.post(`${OUTLINE_SERVER}${OUTLINE_API}`, {}, {
            headers: { 'Content-Type': 'application/json' },
            // Add necessary auth headers if required
        });
        const key_id = createResponse.data.id;

        // Step 2: Rename the key to associate it with Telegram user
        const keyName = `key_${user_id}`;
        await axios.put(`${OUTLINE_SERVER}${OUTLINE_API}/${key_id}/name`, { name: keyName });

        // Step 3: Generate the dynamic link
        const dynamicLink = genOutlineDynamicLink(user_id);

        return dynamicLink;
    } catch (error) {
        console.error('Error creating a new Outline key:', error);
    }
}

// Helper function to generate a dynamic link
function genOutlineDynamicLink(user_id) {
    return `${OUTLINE_USERS_GATEWAY}/conf/${OUTLINE_SALT}${user_id.toString(16)}#${CONN_NAME}`;
}

// Bot command to generate a key
bot.onText(/\/generate_key/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Generate a new key for the user
    const dynamicLink = await createNewKey(userId);

    // Send the dynamic link back to the user
    if (dynamicLink) {
        bot.sendMessage(chatId, `Your dynamic link: ${dynamicLink}`);
    } else {
        bot.sendMessage(chatId, `Sorry, something went wrong.`);
    }
});
