FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
EXPOSE 3000 3001
CMD ["node", "src/server.js"]
