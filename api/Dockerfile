FROM oven/bun:1.4

WORKDIR /app

# Install deps first (cache layer)
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

# Copy source
COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
