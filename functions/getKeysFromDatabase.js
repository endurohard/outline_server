const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

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

        // Создание нового Excel файла
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Keys List');

        // Добавление заголовков
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'User ID', key: 'user_id', width: 15 },
            { header: 'Key Value', key: 'key_value', width: 30 },
            { header: 'Server Name', key: 'server_name', width: 20 },
            { header: 'Creation Date', key: 'creation_date', width: 20 },
        ];

        // Добавление данных
        res.rows.forEach(row => {
            worksheet.addRow(row);
        });

        // Сохранение файла
        const filePath = path.join(__dirname, 'keys_list.xlsx');
        await workbook.xlsx.writeFile(filePath);
        console.log('[68] Excel файл создан:', filePath);

        // Отправка файла в чат
        await bot.sendDocument(chatId, filePath);
        console.log('[69] Файл отправлен пользователю');

        // Удаление временного файла
        fs.unlinkSync(filePath);
        console.log('[70] Временный файл удален');
    } catch (err) {
        console.error('[71] Ошибка при создании или отправке Excel файла:', err);
        await bot.sendMessage(chatId, 'Произошла ошибка при отправке списка ключей.');
    }
}

module.exports = getKeysFromDatabase;