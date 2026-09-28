FROM python:3.12-alpine
WORKDIR /app
COPY cache /app/cache
COPY planet /app/planet
ENV PYTHONPATH=/app
USER 1000:1000
EXPOSE 8080
CMD ["python", "-u", "-m", "cache.server"]
