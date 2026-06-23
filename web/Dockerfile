FROM nginx:1.27-alpine

# Copy built assets
COPY dist /usr/share/nginx/html

# Nginx config: SPA fallback + API proxy to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
