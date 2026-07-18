#!/bin/sh
set -e

CERT_DIR="/etc/nginx/ssl"
LETSENCRYPT_DIR="/etc/letsencrypt"
DOMAIN="${ACME_DOMAIN:-}"
EMAIL="${ACME_EMAIL:-}"
STAGING="${ACME_STAGING:-false}"

mkdir -p "$CERT_DIR" /var/www/acme

# Start nginx in background to serve ACME webroot challenge
/usr/sbin/nginx -c /etc/nginx/conf.d/default.conf &

# Give nginx time to start
sleep 2

if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
    echo "ACME mode: attempting Let's Encrypt certificate for $DOMAIN"

    if [ -f "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" ]; then
        echo "Certificate exists, attempting renewal if needed..."
        certbot renew --webroot -w /var/www/acme --non-interactive 2>/dev/null || true
    else
        echo "Obtaining initial certificate via webroot mode..."
        certbot_args="certonly --webroot -w /var/www/acme --non-interactive --agree-tos \
            -m $EMAIL -d $DOMAIN"
        if [ "$STAGING" = "true" ]; then
            certbot_args="$certbot_args --staging"
        fi
        certbot $certbot_args || {
            echo "WARNING: certbot failed, falling back to self-signed"
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout "$CERT_DIR/server.key" \
                -out "$CERT_DIR/server.crt" \
                -subj "/CN=$DOMAIN"
            echo "Self-signed certificate generated."
        }
    fi

    # Copy the certs to where nginx expects them
    if [ -f "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" ]; then
        cp -Lf "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" "$CERT_DIR/server.crt"
        cp -Lf "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" "$CERT_DIR/server.key"
        echo "Let's Encrypt certificates installed successfully."
    fi
else
    echo "No ACME_DOMAIN set — generating self-signed certificate"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$CERT_DIR/server.key" \
        -out "$CERT_DIR/server.crt" \
        -subj '/CN=localhost'
    echo "Self-signed certificate generated."
fi

# Fallback: ensure cert files exist
if [ ! -f "$CERT_DIR/server.crt" ] || [ ! -f "$CERT_DIR/server.key" ]; then
    echo "Generating emergency self-signed certificate..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$CERT_DIR/server.key" \
        -out "$CERT_DIR/server.crt" \
        -subj '/CN=localhost'
fi

# Stop background nginx gracefully
/usr/sbin/nginx -s quit 2>/dev/null || true
sleep 1

echo "Starting nginx in foreground..."
exec /usr/sbin/nginx -g "daemon off;"
