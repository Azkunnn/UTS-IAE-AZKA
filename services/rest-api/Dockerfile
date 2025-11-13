# REST API Dockerfile
FROM node:18-alpine

RUN apk add --no-cache --virtual .build-deps python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "start"]