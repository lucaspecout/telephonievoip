# SECours Calls Dashboard (OVH VoIP)

Dashboard de supervision des appels entrants/sortants/manqués pour un centre de secours (Protection Civile), synchronisé via l'API OVH Téléphonie.

## Stack
- Backend: FastAPI + SQLAlchemy + Alembic
- DB: PostgreSQL
- Jobs: Celery + Redis
- Frontend: React + TypeScript + Vite
- Reverse proxy: à fournir par votre infrastructure (ex: NPM)

## Démarrage local

```bash
cp .env.example .env
make up
make migrate
make create-admin
```

Accès (docker-compose):
- Interface web + API: http://localhost:1128

### Premier compte admin
Par défaut, le compte admin est créé avec `admin / admin` et le flag `must_change_password` est activé. Changez le mot de passe dès la première connexion.

## Configuration OVH
Dans l'interface Admin > Paramètres OVH:
- `billingAccount`
- `serviceName(s)` (plusieurs lignes)
- `appKey`, `appSecret`, `consumerKey`
- numéros surveillés

La synchronisation des CDR tourne toutes les 60 secondes via Celery Beat.

## Export CSV
L'export CSV est réservé aux ADMIN par défaut. Modifiez `ALLOW_CSV_EXPORT_FOR_OPERATORS` dans `.env` si besoin.

## Endpoints clés
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /users/me`
- `GET /calls`
- `GET /dashboard/summary`
- `GET /dashboard/timeseries`

## Backups & restore

```bash
# backup
pg_dump -h localhost -U postgres telephonievoip > backup.sql

# restore
psql -h localhost -U postgres telephonievoip < backup.sql
```

## Tests backend

```bash
cd backend
pytest
```

## Notes sécurité
- Hashing Argon2id via `passlib`
- Refresh tokens stockés côté serveur avec rotation et révocation
- Rate limiting login via Redis
- Audit logs pour connexions et modifications sensibles
