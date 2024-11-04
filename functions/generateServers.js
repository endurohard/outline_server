require('dotenv').config();

function getServersFromEnv() {
    console.log('[41] Функция getServersFromEnv вызвана');

    const servers = [];
    for (const [key, value] of Object.entries(process.env)) {
        console.log(`[42] Обработка переменной окружения: ${key}`);

        if (key.startsWith('OUTLINE_API_URL_')) {
            const serverSuffix = key.split('OUTLINE_API_URL_')[1].toLowerCase();
            const serverName = serverSuffix.charAt(0).toUpperCase() + serverSuffix.slice(1);

            console.log(`[43] Добавление сервера: ${serverName}`);

            const [id, apiUrl] = value.split('|');
            servers.push({ id: parseInt(id, 10), name: serverName, apiUrl });

            console.log(`[44] Сервер добавлен: { id: ${id}, name: ${serverName}, apiUrl: ${apiUrl} }`);
        }
    }

    console.log('[45] Все серверы загружены:', servers);
    return servers;
}

module.exports = getServersFromEnv;