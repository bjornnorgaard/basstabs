# Static SPA served by nginx – no Node runtime in the final image.
#
# Tabs live in the browser's localStorage, so there is no server-side state or
# runtime config. nginx-unprivileged runs as UID 101 and writes only to /tmp,
# so the container also works with a read-only root filesystem and any
# non-root runAsUser.

FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:884e0b7f42f303641b0f4e78755aea647521dca0b89ca3be7992ad78b5c07434
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
USER 101
EXPOSE 3000
