FROM node:20-slim

RUN apt update && apt install net-tools && apt install curl -y && npm install -g yarn ts-node

WORKDIR /app

EXPOSE 3000

COPY ./package.json .
COPY ./yarn.lock .

RUN yarn install --frozen-lockfile

COPY ./src .

ENTRYPOINT ["ts-node", "./src/index.ts"]
