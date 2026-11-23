#!/bin/sh
# Run by the nginx image's entrypoint (/docker-entrypoint.d) before nginx starts.
# REAL_IP_FROM: space- or comma-separated CIDRs of the proxies in front of this container (ingress,
# load balancer, Cloudflare). nginx then takes the client address from REAL_IP_HEADER (default
# X-Forwarded-For, right-most untrusted hop), so the backend's per-client rate limits see real users.
# Unset = trust nobody (direct exposure, e.g. docker-compose on a host port). Never 0.0.0.0/0.
set -eu
out=/etc/nginx/conf.d/00-real-ip.conf
rm -f "$out"
[ -n "${REAL_IP_FROM:-}" ] || exit 0
{
  echo "# Generated from REAL_IP_FROM by 15-real-ip.sh"
  for cidr in $(printf '%s' "$REAL_IP_FROM" | tr ',' ' '); do
    case "$cidr" in
      0.0.0.0/0|::/0) echo "15-real-ip.sh: refusing to trust $cidr" >&2; exit 1 ;;
      *[!0-9a-fA-F.:/]*) echo "15-real-ip.sh: invalid CIDR '$cidr'" >&2; exit 1 ;;
    esac
    echo "set_real_ip_from $cidr;"
  done
  echo "real_ip_header ${REAL_IP_HEADER:-X-Forwarded-For};"
  echo "real_ip_recursive on;"
} > "$out"
echo "15-real-ip.sh: trusting $REAL_IP_FROM for ${REAL_IP_HEADER:-X-Forwarded-For}"
