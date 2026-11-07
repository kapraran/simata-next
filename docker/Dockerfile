FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/import/package.json tools/import/
COPY tools/admin/package.json tools/admin/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
