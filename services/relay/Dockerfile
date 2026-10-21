# Nabla room relay. Plain ws:// on PORT (no TLS: terminate TLS in the reverse proxy).
# Build from this directory:
#   docker build -t nabla-relay services/relay
#   docker run --rm -p 8787:8787 -e ALLOWED_ORIGINS=https://euskadi.online nabla-relay
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs ./
ENV PORT=8787 HOST=0.0.0.0
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "server.mjs"]
