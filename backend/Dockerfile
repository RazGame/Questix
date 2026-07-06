FROM node:18-bookworm-slim

WORKDIR /app

# Python + pip для SpotiFLAC (загрузка/поиск песен «Угадай мелодию»).
# Debian-база надёжнее alpine/musl для сборки колёс SpotiFLAC.
# ffmpeg нужен SpotiFLAC для некоторых провайдеров/контейнеров.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Node-зависимости
COPY package*.json ./
RUN npm install

# Python-зависимости (SpotiFLAC). PEP 668: ставим в системный python.
# Без «|| true»: провал установки должен валить сборку, а не всплывать
# «ошибками загрузки» в рантайме.
COPY tools/ ./tools/
RUN pip3 install --no-cache-dir --break-system-packages -r tools/requirements.txt

# Исходники и сборка
COPY . .
RUN npm run build

ENV PYTHON=python3
EXPOSE 5000

CMD ["npm", "start"]
