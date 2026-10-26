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

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
USER 101
EXPOSE 3000
