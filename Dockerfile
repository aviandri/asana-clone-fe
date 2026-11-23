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
# BACKEND_HOST is the Host header sent upstream; the literal $proxy_host (nginx variable) means "the
# host in BACKEND_URL", which is what an ingress in front of the backend routes on.
# REAL_IP_FROM (unset by default): CIDRs of the proxies in front of this container; see deploy/15-real-ip.sh.
ENV BACKEND_URL=http://be:3000 \
    BACKEND_HOST=\$proxy_host
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 deploy/15-real-ip.sh /docker-entrypoint.d/15-real-ip.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
