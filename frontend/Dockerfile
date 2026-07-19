FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# Адреса API/сокета для облачной сборки (Vite запекает на этапе build).
# Пусто = локальная схема «origin:5000» (LAN-станция) — как раньше.
ARG VITE_API_URL=
ARG VITE_SOCKET_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY --from=build /app/dist ./dist

EXPOSE 5173

CMD ["npm", "run", "preview"]
