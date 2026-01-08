from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

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

    def list_consumptions(
        self, from_date: Optional[datetime] = None, to_date: Optional[datetime] = None
    ) -> List[Tuple[str, str]]:
        service_names = self._service_names() or self.list_services()
        consumptions: List[Tuple[str, str]] = []
        for service_name in service_names:
            consumptions.extend(
                self._list_service_consumptions(service_name, from_date, to_date)
            )
        return consumptions

    def list_consumption_ids(self) -> List[Tuple[str, str]]:
        return self.list_consumptions()

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

    def _list_service_consumptions(
        self,
        service_name: str,
        from_date: Optional[datetime],
        to_date: Optional[datetime],
    ) -> List[Tuple[str, str]]:
        path = (
            f"/telephony/{self.settings.billing_account}/service/{service_name}/voiceConsumption"
        )
        params: Dict[str, Any] = {}
        if from_date:
            params["from"] = from_date.isoformat()
        if to_date:
            params["to"] = to_date.isoformat()
        if params:
            try:
                consumption_ids = self._client.get(path, **params)
            except Exception:
                consumption_ids = self._client.get(path)
        else:
            consumption_ids = self._client.get(path)
        return [(service_name, str(consumption_id)) for consumption_id in consumption_ids]
