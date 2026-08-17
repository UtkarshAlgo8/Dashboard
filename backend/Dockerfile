FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

# Listen port. Defaults to the production value so the existing deploy is
# unchanged; the test stack overrides it (`--build-arg PORT=8815`, and
# `-e PORT=8815` at run time, since config.js reads it from the environment).
ARG PORT=8814
ENV PORT=${PORT}

EXPOSE ${PORT}

CMD ["npm", "start"]
