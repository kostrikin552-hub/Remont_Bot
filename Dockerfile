# ==============================================================================
# Этап 1: Сборка фронтенда калькулятора (React + Vite + Tailwind CSS)
# ==============================================================================
FROM node:20-slim AS frontend-builder

WORKDIR /app

# Копируем конфигурационные файлы пакетов
COPY package*.json bun.lock* ./

# Устанавливаем зависимости фронтенда
RUN npm install --legacy-peer-deps

# Копируем исходники фронтенда и конфигурацию сборщика
COPY index.html tsconfig*.json vite.config.ts ./
COPY src/ ./src/

# Сборка production-бандла в директорию /app/dist
RUN npm run build

# ==============================================================================
# Этап 2: Запуск монолитного сервиса FastAPI + aiogram 3 (Python 3.11)
# ==============================================================================
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=10000

# Установка Python зависимостей
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Копирование исходного кода бэкенда
COPY backend/ /app/
COPY backend/ /app/backend/

# Копирование собранного фронтенда из первого этапа
COPY --from=frontend-builder /app/dist /app/dist

EXPOSE 10000

# Запуск FastAPI приложения, раздающего и API/вебхуки, и статический фронтенд
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
