from typing import List, Dict, Any, Tuple

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

    def list_services(self) -> List[str]:
        return self._client.get(f"/telephony/{self.settings.billing_account}/service")

    def list_consumptions(self) -> List[Tuple[str, str]]:
        service_names = self._service_names() or self.list_services()
        consumptions: List[Tuple[str, str]] = []
        for service_name in service_names:
            for consumption_id in self._client.get(
                f"/telephony/{self.settings.billing_account}/service/{service_name}/voiceConsumption"
            ):
                consumptions.append((service_name, str(consumption_id)))
        return consumptions

    def get_me(self) -> Dict[str, Any]:
        return self._client.get("/me")

    def get_consumption_detail(self, service_name: str, consumption_id: str) -> Dict[str, Any]:
        return self._client.get(
            f"/telephony/{self.settings.billing_account}/service/{service_name}/voiceConsumption/{consumption_id}"
        )

    def _service_names(self) -> List[str]:
        if not self.settings.service_names:
            return []
        return [value.strip() for value in self.settings.service_names.split(",") if value.strip()]
