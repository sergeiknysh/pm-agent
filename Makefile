.PHONY: up down build logs ps restart api-shell web-shell clean help

help:
	@echo "pm-agent dev commands"
	@echo "  make up        - docker compose up --build"
	@echo "  make down      - docker compose down"
	@echo "  make build     - docker compose build"
	@echo "  make logs      - docker compose logs -f --tail=200"
	@echo "  make ps        - docker compose ps"
	@echo "  make restart   - restart containers"
	@echo "  make api-shell - shell into api container"
	@echo "  make web-shell - shell into web container"
	@echo "  make clean     - remove containers + volumes (node_modules)"

up:
	docker compose up -d --build

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

restart:
	docker compose restart

api-shell:
	docker compose exec api sh

web-shell:
	docker compose exec web sh

clean:
	docker compose down -v
