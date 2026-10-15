FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
ENV NABLA_ONLINE_BIND=0.0.0.0
EXPOSE 8789
USER nobody
CMD ["python", "server.py"]
