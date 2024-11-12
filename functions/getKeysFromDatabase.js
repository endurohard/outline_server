const db = require('../db');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Функция для получения списка ключей и отправки администратору в виде Excel
async function getKeysFromDatabase(bot, chatId) {
    console.log('[64] Вызов функции getKeysFromDatabase');

    try {
        console.log('[65] Выполнение запроса к базе данных для получения списка ключей');
        const res = await db.query(`
            SELECT k.id, k.user_id, k.key_value, k.creation_date, s.name AS server_name
            FROM keys k
                     LEFT JOIN servers s ON k.server_id = s.id
            ORDER BY k.creation_date DESC;
        `);

        if (res.rows.length === 0) {
            console.log('[66] Ключи не найдены в базе данных');
            await bot.sendMessage(chatId, 'Ключи не найдены.');
            return;
        }

        console.log(`[67] Получено ${res.rows.length} ключей из базы данных`);

        // Формируем данные для Excel
        const data = res.rows.map(row => ({
            'ID ключа': row.id,
            'Пользователь ID': row.user_id,
            'Ключ': row.key_value,
            'Дата создания': row.creation_date,
            'Сервер': row.server_name || 'Неизвестный'
        }));

        // Создаем рабочую книгу Excel
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Ключи');

        // Убедимся, что директория temp существует
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
            console.log('[68] Директория temp создана');
        }

        // Сохраняем файл во временной папке
        const filePath = path.join(tempDir, `keys_${Date.now()}.xlsx`);
        XLSX.writeFile(workbook, filePath);

        console.log(`[69] Excel-файл создан: ${filePath}`);

        // Отправляем файл администратору
        await bot.sendDocument(chatId, filePath);

        // Удаляем файл после отправки
        fs.unlinkSync(filePath);
        console.log('[70] Excel-файл отправлен и удален.');
    } catch (err) {
        console.error('[71] Ошибка при получении списка ключей:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при получении списка ключей.');
    }
}

module.exports = getKeysFromDatabase;