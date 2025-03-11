FROM node:16-slim

RUN apt update && apt install net-tools && apt install curl -y

WORKDIR /usr/local/bin

WORKDIR /usr/src/

COPY ./ .

RUN npm install
RUN npm run build

EXPOSE 80

ENTRYPOINT ["node", "./lib/index.js"]
