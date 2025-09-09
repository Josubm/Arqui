FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm i --only=prod
COPY . .
EXPOSE 5173
CMD ["npm","start"]
