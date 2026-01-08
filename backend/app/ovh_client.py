from typing import List, Dict, Any

import ovh

from app.models import OvhSettings


class OVHClient:
    def __init__(self, settings: OvhSettings, endpoint: str) -> None:
        self.settings = settings
        self.endpoint = endpoint
        self._client = ovh.Client(
            endpoint=endpoint,
            application_key=settings.app_key,
            application_secret=settings.app_secret,
            consumer_key=settings.consumer_key,
        )

    def list_consumption_ids(self) -> List[str]:
        return self._client.get(
            f"/telephony/{self.settings.billing_account}/voiceConsumption",
            serviceName=self._service_names(),
        )

    def get_consumption_detail(self, consumption_id: str) -> Dict[str, Any]:
        return self._client.get(
            f"/telephony/{self.settings.billing_account}/voiceConsumption/{consumption_id}"
        )

    def _service_names(self) -> List[str]:
        if not self.settings.service_names:
            return []
        return [value.strip() for value in self.settings.service_names.split(",") if value.strip()]
