# ЭТАП 1: Сборка фронтенда на Node.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# ЭТАП 2: Запуск бэкенда на Python
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY backend/requirements.txt* requirements.txt* ./
RUN pip install --no-cache-dir -r requirements.txt

# Копируем бэкенд и собранную папку dist из первого этапа
COPY backend/ /app/
COPY --from=builder /app/dist /app/dist

EXPOSE 10000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
