FROM node:22-alpine
ENV TZ=America/Mexico_City NODE_ENV=production
RUN apk add --no-cache tzdata
WORKDIR /app
COPY server.js ./
COPY public ./public
COPY config.json ./config.json
ENV CONFIG_PATH=/config/config.json
EXPOSE 8080
USER node
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/config >/dev/null || exit 1
CMD ["node", "server.js"]
