// functions/generateServers.js
require('dotenv').config();

function getServersFromEnv() {
    const servers = [];
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith('OUTLINE_API_URL_')) {
            const serverSuffix = key.split('OUTLINE_API_URL_')[1].toLowerCase();
            const serverName = serverSuffix.charAt(0).toUpperCase() + serverSuffix.slice(1);

            const [id, apiUrl] = value.split('|');
            servers.push({ id: parseInt(id, 10), name: serverName, apiUrl });
        }
    }
    return servers;
}

module.exports = getServersFromEnv;