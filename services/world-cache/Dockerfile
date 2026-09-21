FROM python:3.12-alpine
WORKDIR /app
COPY server.py /app/server.py
USER 1000:1000
EXPOSE 8080
CMD ["python", "-u", "/app/server.py"]
