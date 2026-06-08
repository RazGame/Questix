FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY --from=build /app/dist ./dist

EXPOSE 5173

CMD ["npm", "run", "preview"]
