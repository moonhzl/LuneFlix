FROM node:22-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY back ./back
COPY frontend ./frontend
COPY supabase ./supabase
COPY README.md ./README.md

ENV NODE_ENV=production
ENV PYTHON_BIN=python3

CMD ["npm", "start"]
