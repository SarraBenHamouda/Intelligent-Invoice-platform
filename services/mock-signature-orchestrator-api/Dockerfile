FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DEFAULT_TIMEOUT=600
ENV PIP_RETRIES=20
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt .

RUN python -m pip install \
    --timeout 600 \
    --retries 20 \
    --use-deprecated=legacy-resolver \
    -r requirements.txt

COPY app.py .

RUN mkdir -p \
    /app/storage/accepted \
    /app/storage/rejected \
    /app/storage/pending \
    /app/storage/errors \
    /app/storage/qrcodes

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]