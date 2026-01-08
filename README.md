# Secours Calls Dashboard (OVH VoIP)

Dashboard web pour centre de secours (Protection Civile) connecté à OVH Téléphonie.

## ✅ Fonctionnalités

- KPI et graphiques (aujourd'hui + 7 jours)
- Derniers appels en temps réel (WebSocket)
- Filtrage appels (date, direction, manqués, numéro)
- Export CSV (ADMIN)
- Synchronisation régulière via l'API OVH Telephony `voiceConsumption`
- Gestion utilisateurs (ADMIN/OPERATEUR)
- Paramètres OVH + test de connexion
- Auth par mot de passe (Argon2id) + JWT
- Obligation de changement de mot de passe au 1er login

> ⚠️ IMPORTANT: il n'y a **aucune restriction IP** ni allowlist d'origines.

## Démarrage

```bash
docker compose up -d
```

L'API + UI sont disponibles sur `http://localhost:1128`.

### Compte bootstrap

- username: `admin`
- password: `admin`
- role: `ADMIN`
- `must_change_password=true` au premier login.

## Architecture (3 conteneurs)

- **web**: FastAPI + worker + scheduler + UI React statique
- **db**: PostgreSQL
- **redis**: Pub/Sub + queue

## Variables d'environnement

| Variable | Description | Défaut |
| --- | --- | --- |
| DATABASE_URL | Connexion Postgres | `postgresql+psycopg2://telephonie:telephonie@db:5432/telephonie` |
| REDIS_URL | Redis | `redis://redis:6379/0` |
| JWT_SECRET | Secret JWT | `change-me` |
| ACCESS_TOKEN_EXPIRE_MINUTES | Durée du token | `480` |
| SYNC_INTERVAL_SECONDS | Intervalle de sync OVH | `45` |
| OVH_ENDPOINT | Endpoint OVH | `ovh-eu` |

## Synchronisation OVH

1. Renseigner les paramètres OVH dans **Admin > Paramètres OVH**
2. Tester la connexion
3. La synchronisation se fait ensuite automatiquement toutes les 45 secondes

Les appels sont stockés avec `ovh_consumption_id` unique.

## API (minimum)

- `POST /auth/login`
- `POST /auth/change-password`
- `GET /me`
- `GET /calls` (+ filtres, pagination, export CSV)
- `GET /dashboard/summary`
- `GET /dashboard/timeseries`
- `GET/POST/PATCH /users`
- `GET/PUT /settings/ovh`
- `POST /settings/ovh/test`
- WebSocket `GET /ws`

## Migrations (Alembic)

Si besoin:

```bash
alembic -c backend/alembic.ini upgrade head
```

## Développement local (optionnel)

- Backend: `python -m app.entrypoint`
- Frontend: `npm run dev` (proxy à ajouter si besoin)
