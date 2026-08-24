FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN apk add --no-cache wget

EXPOSE 4000
CMD ["node", "src/index.js"]
