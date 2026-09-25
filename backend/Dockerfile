FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Копируем requirements (поддерживая как сборку из корня, так и из папки backend)
COPY backend/requirements.txt* requirements.txt* ./
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь бэкенд
COPY backend/ /app/
COPY backend/main.py* /app/

EXPOSE 10000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
