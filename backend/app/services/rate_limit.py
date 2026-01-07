from datetime import timedelta
import redis
from redis.exceptions import ConnectionError
from app.core.config import settings


class RateLimiter:
    def __init__(self, prefix: str = "login", limit: int = 5, window_seconds: int = 300):
        self.prefix = prefix
        self.limit = limit
        self.window_seconds = window_seconds
        self.client = redis.Redis.from_url(settings.redis_url, decode_responses=True)

    def hit(self, key: str) -> bool:
        redis_key = f"{self.prefix}:{key}"
        try:
            count = self.client.incr(redis_key)
            if count == 1:
                self.client.expire(redis_key, self.window_seconds)
            return count <= self.limit
        except ConnectionError:
            return True

    def reset(self, key: str) -> None:
        redis_key = f"{self.prefix}:{key}"
        try:
            self.client.delete(redis_key)
        except ConnectionError:
            return
