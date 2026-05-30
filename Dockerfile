FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --production

# Copy frontend and backend
COPY Backend ./Backend
COPY Frontend ./Frontend

EXPOSE 3000 3001
CMD ["node", "Backend/server.js"]
