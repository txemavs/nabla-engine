# Nabla room relay. Build from this directory:
#   docker build -t nabla-relay services/relay
#   docker run --rm -p 10003:10003 nabla-relay
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs combat.mjs connection.mjs continuous-world.mjs spatial-index.mjs ./
ENV PORT=10003 HOST=0.0.0.0
EXPOSE 10003
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "server.mjs"]
