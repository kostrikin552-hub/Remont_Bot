# Базовый легковесный образ Python 3.11-slim
FROM python:3.11-slim

# Настройки окружения Python
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

WORKDIR /app

# Установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование исходного кода бэкенда
COPY . /app/backend/

EXPOSE 10000

# Запуск приложения через uvicorn
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "10000"]
