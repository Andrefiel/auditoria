FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache wget

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Garante permissões adequadas no diretório de uploads e aplicação para o usuário não-root
RUN mkdir -p /app/uploads && chown -R node:node /app

# Execução segura com usuário não-privilegiado (UID 1000)
USER node

EXPOSE 4000
CMD ["node", "src/index.js"]

