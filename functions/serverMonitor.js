const axios = require('axios');
const https = require('https');
const schedule = require('node-schedule'); // Планировщик задач
const getServersFromEnv = require('./generateServers');

let availableServers = getServersFromEnv();

// Создаем HTTPS агент
const httpsAgent = new https.Agent({
    rejectUnauthorized: false // Игнорируем самоподписанные сертификаты
});

async function checkServerAvailability(server) {
    try {
        const response = await axios.get(`${server.apiUrl}/server/metrics/transfer`, {
            timeout: 5000,
            httpsAgent
        });

        if (response.status && response.data) {
            console.log(`[Monitor] Сервер ${server.name} доступен. Код ответа: ${response.status}`);
            return true; // Сервер доступен
        }

        console.warn(`[Monitor] Сервер ${server.name} ответил, но данные некорректны.`);
        return false;
    } catch (error) {
        if (error.response) {
            console.log(`[Monitor] Сервер ${server.name} доступен. Ошибка HTTP: ${error.response.status}`);
            return true; // Ответ получен, сервер доступен
        } else if (error.message.includes('self-signed certificate')) {
            console.log(`[Monitor] Сервер ${server.name} доступен, но использует самоподписанный сертификат.`);
            return true;
        }

        console.error(`[Monitor] Сервер ${server.name} недоступен. Ошибка: ${error.message}`);
        return false; // Сервер недоступен
    }
}

async function monitorServers(bot, adminId) {
    console.log(`[Monitor] Запуск проверки доступности серверов...`);
    const newAvailableServers = [];
    const unavailableServers = [];

    for (const server of availableServers) {
        const isAvailable = await checkServerAvailability(server);
        if (isAvailable) {
            newAvailableServers.push(server);
        } else {
            unavailableServers.push(server.name);
        }
    }

    if (JSON.stringify(newAvailableServers) !== JSON.stringify(availableServers)) {
        availableServers.length = 0;  // Сбрасываем текущий список
        Array.prototype.push.apply(availableServers, newAvailableServers);  // Обновляем глобальный список
        if (unavailableServers.length > 0) {
            await bot.sendMessage(adminId, `⚠️ Недоступны следующие серверы: ${unavailableServers.join(', ')}`);
        }
    }
}
function getAvailableServers() {
    return availableServers;
}
module.exports = {
    availableServers,
    monitorServers, getAvailableServers
};