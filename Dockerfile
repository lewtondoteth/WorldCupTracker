FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm --prefix server install
RUN npm --prefix client install

COPY . .

RUN npm --prefix client run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/index.js"]
