FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

ENV PIP_DEFAULT_TIMEOUT=300
ENV PIP_RETRIES=10

RUN pip install \
    --no-cache-dir \
    --default-timeout=300 \
    --retries 10 \
    -r requirements.txt

COPY app.py .

RUN mkdir -p \
    /app/storage/accepted \
    /app/storage/rejected \
    /app/storage/pending_retry \
    /app/storage/errors \
    /app/storage/qrcodes

EXPOSE 8000

CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8000"]