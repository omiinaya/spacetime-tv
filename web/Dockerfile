# ---- Build stage ----
FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache openssl

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Build production bundle
COPY . .
RUN npm run build

# ---- Production stage ----
FROM nginx:1.27-alpine

# Install certbot and openssl for ACME / Let's Encrypt support
RUN apk add --no-cache openssl certbot py3-pip && \
    pip3 install --no-cache-dir certbot-nginx 2>/dev/null || true

# Create ACME challenge directory for webroot-01 verification
RUN mkdir -p /var/www/acme

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config: SPA fallback + API proxy to backend + ACME challenge endpoint
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Entrypoint: obtains Let's Encrypt cert (if ACME_DOMAIN set) or falls back to self-signed
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
