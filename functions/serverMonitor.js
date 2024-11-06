const axios = require('axios');
const schedule = require('node-schedule');
const getServersFromEnv = require('./generateServers');

let availableServers = getServersFromEnv();

async function checkServerAvailability(server) {
    try {
        const response = await axios.get(server.apiUrl, { timeout: 5000 });
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

async function monitorServers(bot, adminId) {
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
        availableServers = newAvailableServers;
        if (unavailableServers.length > 0) {
            await bot.sendMessage(adminId, `⚠️ Недоступны следующие серверы: ${unavailableServers.join(', ')}`);
        }
    }
}

schedule.scheduleJob('*/5 * * * *', () => monitorServers(bot, adminId));

module.exports = { availableServers, monitorServers };