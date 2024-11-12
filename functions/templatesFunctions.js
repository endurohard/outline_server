const db = require('../db'); // Подключение к базе данных

// Получение списка шаблонов из базы данных
async function getTemplates() {
    const result = await db.query('SELECT * FROM templates ORDER BY id');
    return result.rows;
}

// Добавление нового шаблона в базу данных
async function addTemplate(name, details) {
    await db.query('INSERT INTO templates (name, details) VALUES ($1, $2)', [name, details]);
    console.log(`[INFO] Шаблон "${name}" успешно добавлен.`);
}

// Удаление шаблона по имени
async function deleteTemplate(name) {
    await db.query('DELETE FROM templates WHERE name = $1', [name]);
    console.log(`[INFO] Шаблон "${name}" успешно удалён.`);
}

// Отображение клавиатуры шаблонов
async function showTemplatesKeyboard(bot, chatId) {
    try {
        const templates = await getTemplates();

        const keyboard = templates.map(template => [
            { text: template.name, callback_data: `send_template_${template.id}` },
            { text: '❌ Удалить', callback_data: `delete_template_${template.id}` }
        ]);

        // Добавляем кнопку "➕ Создать шаблон" в конец клавиатуры
        keyboard.push([{ text: '➕ Создать шаблон', callback_data: 'create_template' }]);

        await bot.sendMessage(chatId, 'Выберите шаблон или создайте новый:', {
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        console.error('[ERROR] Ошибка при отображении шаблонов:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка при загрузке шаблонов. Попробуйте позже.');
    }
}

module.exports = {
    getTemplates,
    addTemplate,
    deleteTemplate,
    showTemplatesKeyboard,
};