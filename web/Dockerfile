# ---- Build stage ----
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Build production bundle
COPY . .
RUN npm run build

# ---- Production stage ----
FROM nginx:1.27-alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config: SPA fallback + API proxy to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
