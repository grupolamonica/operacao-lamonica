FROM oven/bun:1

WORKDIR /app

# Install deps first (cache layer)
COPY package.json bun.lock* bun.lockb* ./
RUN bun install

# Copy source
COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
