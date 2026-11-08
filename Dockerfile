FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN addgroup -S ta && adduser -S ta -G ta && mkdir -p /var/lib/ta-ipo && chown ta:ta /var/lib/ta-ipo
USER ta
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
