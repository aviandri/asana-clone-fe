# syntax=docker/dockerfile:1
# Frontend image: build the Vite SPA, serve it with nginx, proxy /api and /health to the backend.

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
# Upstream is configurable for non-compose deployments; default matches the compose service name.
ENV BACKEND_URL=http://be:3000
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
