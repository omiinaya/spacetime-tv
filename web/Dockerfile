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

# Generate self-signed TLS certificate for HTTPS
RUN apk add --no-cache openssl &&     mkdir -p /etc/nginx/ssl &&     openssl req -x509 -nodes -days 365 -newkey rsa:2048         -keyout /etc/nginx/ssl/server.key         -out /etc/nginx/ssl/server.crt         -subj '/CN=localhost'

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config: SPA fallback + API proxy to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443
