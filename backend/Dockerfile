FROM node:18-bookworm-slim

WORKDIR /app

# Python + pip для SpotiFLAC (загрузка/поиск песен «Угадай мелодию»).
# Debian-база надёжнее alpine/musl для сборки колёс SpotiFLAC.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Node-зависимости
COPY package*.json ./
RUN npm install

# Python-зависимости (SpotiFLAC). PEP 668: ставим в системный python.
COPY tools/ ./tools/
RUN pip3 install --no-cache-dir --break-system-packages -r tools/requirements.txt || true

# Исходники и сборка
COPY . .
RUN npm run build

ENV PYTHON=python3
EXPOSE 5000

CMD ["npm", "start"]
