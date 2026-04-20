FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts ./
COPY server ./server
COPY scripts ./scripts
COPY src ./src
COPY index.html ./
COPY .env.example ./

RUN npm ci
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/.env.example ./.env.example

RUN mkdir -p /app/server/data /app/server/data/backups

EXPOSE 8787

CMD ["npm", "run", "start:server"]
