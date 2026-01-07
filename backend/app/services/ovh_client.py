from typing import Iterable
import ovh
from app.models import OVHSettings


class OVHClient:
    def __init__(self, settings: OVHSettings):
        self.settings = settings
        self.client = ovh.Client(
            endpoint="ovh-eu",
            application_key=settings.app_key,
            application_secret=settings.app_secret,
            consumer_key=settings.consumer_key,
        )

    def list_consumption_ids(self, service_name: str, from_date: str | None = None, to_date: str | None = None) -> list[str]:
        params = {}
        if from_date:
            params["fromDate"] = from_date
        if to_date:
            params["toDate"] = to_date
        return self.client.get(f"/telephony/{self.settings.billing_account}/service/{service_name}/voiceConsumption", **params)

    def get_consumption_detail(self, service_name: str, consumption_id: str) -> dict:
        return self.client.get(
            f"/telephony/{self.settings.billing_account}/service/{service_name}/voiceConsumption/{consumption_id}"
        )

    def test_connection(self) -> bool:
        self.client.get(f"/telephony/{self.settings.billing_account}/service")
        return True

    def iter_service_names(self) -> Iterable[str]:
        return self.settings.service_names or []
