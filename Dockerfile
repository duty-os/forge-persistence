FROM node:20-slim

RUN apt update && apt install net-tools curl -y

WORKDIR /app

EXPOSE 3000

COPY ./package.json .
COPY ./yarn.lock .

RUN yarn install --frozen-lockfile

COPY ./ ./

RUN yarn build

ENTRYPOINT ["node", "./lib/index.js"]
