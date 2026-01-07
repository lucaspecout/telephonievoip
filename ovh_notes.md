# Notes OVH Telephony

## Endpoints utilisés
- `GET /telephony/{billingAccount}/service/{serviceName}/voiceConsumption`
- `GET /telephony/{billingAccount}/service/{serviceName}/voiceConsumption/{consumptionId}`
- `GET /telephony/{billingAccount}/service` (test de connexion)

## ConsumerKey
1. Créez une application sur https://api.ovh.com/createApp/ pour obtenir `appKey` et `appSecret`.
2. Générez un `consumerKey` avec les droits requis (GET sur les endpoints ci-dessus) via l'API OVH.
3. Renseignez ces paramètres dans l'interface admin.

## Heuristique `is_missed`
OVH n'expose pas toujours un champ explicite. L'application marque `is_missed` si:
- direction entrante (`direction == "in"`) et
- status vaut `missed` ou `no_answer`, ou `duration == 0`.
