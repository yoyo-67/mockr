#!/usr/bin/env bash
# Smoke-test each example: start server, curl key endpoints, assert non-5xx,
# kill server. Fails the whole script if any example fails.
set -u

cd "$(dirname "$0")/.."

declare -a checks
checks+=("01-data-list|3001|GET /api/todos")
checks+=("02-data-files|3002|GET /api/products|GET /api/config")
checks+=("03-cross-endpoint|3003|GET /api/cart")
checks+=("04-handlers-zod|3004|GET /api/users/u1/orders?status=shipped|POST /api/orders {\"user_id\":\"u1\",\"total\":1}")
checks+=("05-middleware|3005|GET /api/health")
checks+=("06-scenarios|3006|GET /api/users")
checks+=("07-multi-method|3007|GET /api/cart")
checks+=("09-forward|3009|GET /users/1?stub=1")
checks+=("10-everything|3010|GET /api/rooms")

# 08-proxy needs an external upstream; skipped in smoke test.

fail=0
for c in "${checks[@]}"; do
  IFS='|' read -ra parts <<< "$c"
  name="${parts[0]}"
  port="${parts[1]}"

  echo "=== $name (port $port) ==="
  npx tsx "examples/$name/server.ts" >/tmp/mockr-$port.log 2>&1 &
  pid=$!

  # Wait for server up.
  for i in $(seq 1 30); do
    if curl -sf "http://localhost:$port/__mockr/scenarios" >/dev/null 2>&1 || \
       curl -sf "http://localhost:$port/" >/dev/null 2>&1 || \
       [[ -n "$(lsof -i ":$port" 2>/dev/null)" ]]; then
      break
    fi
    sleep 0.2
  done

  ok=1
  for ((i=2; i<${#parts[@]}; i++)); do
    req="${parts[$i]}"
    method="${req%% *}"
    rest="${req#* }"
    path="${rest%% *}"
    body=""
    if [[ "$rest" == *" "* ]]; then body="${rest#* }"; fi

    # Retry on 5xx to absorb 5% errorInjection in 10-everything.
    status=000
    for try in 1 2 3 4 5; do
      if [[ -n "$body" ]]; then
        status=$(curl -s -o /tmp/mockr-resp.txt -w "%{http_code}" -X "$method" \
          -H "Content-Type: application/json" -d "$body" "http://localhost:$port$path")
      else
        status=$(curl -s -o /tmp/mockr-resp.txt -w "%{http_code}" -X "$method" \
          "http://localhost:$port$path")
      fi
      [[ "$status" =~ ^[2-4] ]] && break
      sleep 0.1
    done
    body_short=$(head -c 80 /tmp/mockr-resp.txt)
    if [[ "$status" =~ ^[2-4] ]]; then
      echo "  $method $path → $status  $body_short"
    else
      echo "  $method $path → $status (FAIL)  $body_short"
      ok=0
    fi
  done

  kill $pid 2>/dev/null
  wait $pid 2>/dev/null
  if [[ $ok -eq 0 ]]; then
    echo "  --- server log ---"
    cat /tmp/mockr-$port.log
    fail=$((fail+1))
  fi
done

echo
if [[ $fail -gt 0 ]]; then
  echo "FAILED: $fail example(s)"
  exit 1
fi
echo "ALL PASS"
