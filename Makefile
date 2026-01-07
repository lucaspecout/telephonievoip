up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

migrate:
	docker compose exec backend alembic upgrade head

create-admin:
	docker compose exec backend python -m app.cli create-admin
