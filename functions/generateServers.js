require('dotenv').config();

function getServersFromEnv() {
    const servers = [];
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith('OUTLINE_API_URL_')) {
            const serverSuffix = key.split('OUTLINE_API_URL_')[1];
            const serverName = serverSuffix.charAt(0).toUpperCase() + serverSuffix.slice(1).toLowerCase();
            const apiUrl = value;
            const serverId = process.env[`OUTLINE_API_ID_${serverSuffix}`] || null; // Берем ID из .env, если он указан
            servers.push({ id: serverId, name: serverName, apiUrl });
        }
    }
    return servers;
}

module.exports = getServersFromEnv;