# Используем официальный образ Node.js
FROM node:18

# Устанавливаем рабочую директорию
WORKDIR /usr/src/app

# Копируем файл package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install


# Копируем остальные файлы проекта в контейнер
COPY . .

# Устанавливаем переменные окружения
ENV TELEGRAM_TOKEN=your_telegram_token
ENV OUTLINE_API_URL=your_outline_api_url
ENV ADMIN_ID=your_admin_id
ENV OUTLINE_USERS_GATEWAY=ssconf://bestvpn.world
ENV OUTLINE_SALT=50842
ENV CONN_NAME=RaphaelVPN

# Открываем порт (если необходимо, например, для вебхуков)
# EXPOSE 3000

# Команда для запуска бота
CMD ["node", "bot.js"]