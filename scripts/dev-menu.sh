#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

print_menu() {
  cat <<'EOF'

PM-as-files development helper:
1) Start Docker stack
2) Stop Docker stack
3) Show logs (api + web)
4) Open shell in API container
5) Run tests
6) Open project folder
0) Exit
EOF
}

while true; do
  print_menu
  read -rp "Choose an option: " choice
  case "$choice" in
    1)
      docker compose up --build -d
      ;;
    2)
      docker compose down
      ;;
    3)
      docker compose logs -f api web
      ;;
    4)
      docker compose exec api bash
      ;;
    5)
      npm run test
      ;;
    6)
      printf "Project path: %s\n" "$ROOT"
      $SHELL
      ;;
    0)
      echo "Goodbye"
      exit 0
      ;;
    *)
      echo "Invalid selection"
      ;;
  esac
done
