FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ENV PORT=8814

EXPOSE 8814

CMD ["npm", "start"]