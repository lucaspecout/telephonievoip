# Logique "manqués" (is_missed)

L'API OVH Telephony `voiceConsumption` fournit parfois un champ `status`/`nature`.

Heuristique utilisée:

- Si `status` ou `nature` contient `missed` ou `unanswered` (insensible à la casse) -> `is_missed = true`
- Sinon, si `duration == 0` -> `is_missed = true`
- Sinon -> `is_missed = false`

Cette logique est centralisée dans `app/sync.py` (fonction `infer_missed`).
