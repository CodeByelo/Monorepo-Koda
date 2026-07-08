FROM python:3.11-slim

WORKDIR /app

# No requiere dependencias de sistema pesadas (asyncpg y supabase se instalan directo)

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
