FROM python:3.12-alpine
WORKDIR /app
COPY server.py baked_format.py bake.py prefill.py queue_store.py /app/
USER 1000:1000
EXPOSE 8080
CMD ["python", "-u", "/app/server.py"]
