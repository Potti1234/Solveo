FROM oven/bun:1.2.18-debian AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8001
ENV DATABASE_PATH=/data/vultr_audit.db
ENV PYTHON_BIN=python3
ENV BUN_BIN=bun

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8001
CMD ["bun", "src/index.ts"]
