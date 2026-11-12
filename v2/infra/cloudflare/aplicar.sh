#!/usr/bin/env bash
# Publica las reglas del WAF y los límites de frecuencia en Cloudflare.
# Uso:  CF_API_TOKEN=… CF_ZONE_ID=… API_HOST=api.midominio.com  bash aplicar.sh
# El token necesita el permiso «Zone → Zone WAF → Edit». REEMPLAZA las reglas personalizadas que haya en la zona.
set -euo pipefail
: "${CF_API_TOKEN:?falta CF_API_TOKEN}" "${CF_ZONE_ID:?falta CF_ZONE_ID}" "${API_HOST:?falta API_HOST}"
cd "$(dirname "$0")"

publicar() {   # $1 = archivo de reglas · $2 = fase
  sed "s/__API_HOST__/${API_HOST}/g" "$1" |
    curl --fail-with-body -sS -X PUT "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/rulesets/phases/$2/entrypoint" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" --data-binary @- >/dev/null
  echo "Publicado: $1 → $2"
}
publicar reglas-waf.json http_request_firewall_custom
publicar reglas-limite.json http_ratelimit
