#!/bin/sh
set -e

CERT_DIR="/etc/nginx/ssl"
LETSENCRYPT_DIR="/etc/letsencrypt"
DOMAIN="${ACME_DOMAIN:-}"
EMAIL="${ACME_EMAIL:-}"
STAGING="${ACME_STAGING:-false}"

mkdir -p "$CERT_DIR" /var/www/acme

# Step 1: Generate production-grade wildcard certificate with SANs
# Creates a local CA and signs a server cert with IP SAN for the configured
# STV_HOST (defaults to localhost) and wildcard DNS entries for internal use
CA_KEY="$CERT_DIR/ca.key"
CA_CERT="$CERT_DIR/ca.crt"
SERVER_KEY="$CERT_DIR/server.key"
SERVER_CERT="$CERT_DIR/server.crt"
SERVER_CSR="$CERT_DIR/server.csr"
CERT_HOST="${STV_HOST:-127.0.0.1}"
SANS="IP:$CERT_HOST,IP:127.0.0.1,DNS:localhost,DNS:*.local,DNS:*.lan,DNS:*.home"

if [ ! -f "$CA_KEY" ]; then
    echo "Generating local Certificate Authority..."
    openssl genrsa -out "$CA_KEY" 4096
    openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 3650 \
        -out "$CA_CERT" \
        -subj "/CN=SpacetimeTV Local CA/O=SpacetimeTV/C=US"
fi

echo "Generating server key with SANs for $CERT_HOST + wildcards..."
openssl genrsa -out "$SERVER_KEY" 2048
openssl req -new -key "$SERVER_KEY" -out "$SERVER_CSR" \
    -subj "/CN=$CERT_HOST" \
    -addext "subjectAltName=$SANS"
openssl x509 -req -in "$SERVER_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" \
    -CAcreateserial -out "$SERVER_CERT" -days 365 -sha256 \
    -extfile <(printf "subjectAltName=$SANS")

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
