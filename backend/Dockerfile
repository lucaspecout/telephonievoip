FROM node:20-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package.json /frontend/package.json
RUN npm install
COPY frontend /frontend
RUN npm run build

FROM python:3.11-slim

WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend/app /app/app
COPY backend/alembic /app/alembic
COPY backend/alembic.ini /app/alembic.ini
COPY backend/celery_app.py /app/celery_app.py
COPY --from=frontend-build /frontend/dist /app/app/static

ENV PYTHONPATH=/app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
