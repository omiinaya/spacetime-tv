#!/bin/sh
set -e

CERT_DIR="/etc/nginx/ssl"
LETSENCRYPT_DIR="/etc/letsencrypt"
DOMAIN="${ACME_DOMAIN:-}"
EMAIL="${ACME_EMAIL:-}"
STAGING="${ACME_STAGING:-false}"

mkdir -p "$CERT_DIR" /var/www/acme

# Step 1: Generate initial self-signed certificate so nginx can start
INITIAL_CN="${DOMAIN:-localhost}"
echo "Generating initial self-signed certificate for $INITIAL_CN..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -subj "/CN=$INITIAL_CN"

# Step 2: Start nginx in background (needed for ACME webroot)
echo "Starting nginx temporarily for ACME challenge..."
/usr/sbin/nginx -c /etc/nginx/conf.d/default.conf &
sleep 2

# Step 3: Attempt ACME if configured
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
            echo "WARNING: certbot failed, keeping self-signed certificate"
        }
    fi

    # If certbot succeeded, copy certificates to CERT_DIR
    if [ -f "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" ]; then
        echo "ACME certificate obtained. Installing..."
        cp -Lf "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" "$CERT_DIR/server.crt"
        cp -Lf "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" "$CERT_DIR/server.key"
        echo "Let's Encrypt certificates installed."
    fi
fi

# Step 4: Stop background nginx gracefully
echo "Stopping temporary nginx..."
/usr/sbin/nginx -s quit 2>/dev/null || true
sleep 1

# Step 5: Start nginx in foreground
echo "Starting nginx in foreground..."
exec /usr/sbin/nginx -g "daemon off;"
