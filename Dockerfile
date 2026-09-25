FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY wsgi.py .
COPY --from=frontend-build /frontend/dist ./frontend_dist

ENV DATA_DIR=/app/data
RUN mkdir -p /app/data

EXPOSE 5000

CMD ["gunicorn", "--preload", "--bind", "0.0.0.0:5000", "--workers", "2", "wsgi:app"]
