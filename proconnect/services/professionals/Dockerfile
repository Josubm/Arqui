FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm i --only=prod
COPY src ./src
EXPOSE 4002
CMD ["npm","start"]
