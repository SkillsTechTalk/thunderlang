# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22

# Build the app with every dependency, including the ones only needed to build.
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build && \
    npm prune --omit=dev

# The image that runs: only what the app needs.
FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s CMD curl -f http://localhost:3000/health || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/server.js"]
