import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = PROJECT_ROOT / "bookwise.db"


class Settings(BaseSettings):
    database_url: str = f"sqlite:///{DEFAULT_DB.as_posix()}"
    groq_api_key: str | None = None
    google_books_api_key: str | None = None
    secret_key: str = "change-me"

    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")

    def model_post_init(self, __context) -> None:
        # Vercel's native Storage > Postgres injects both DATABASE_URL and
        # POSTGRES_URL. If DATABASE_URL is set, pydantic-settings already loaded
        # it into database_url directly -- fall back to POSTGRES_URL only if
        # neither was provided (i.e. we're still on the local sqlite default).
        if self.database_url.startswith("sqlite"):
            vercel_postgres_url = os.getenv("POSTGRES_URL")
            if vercel_postgres_url:
                self.database_url = vercel_postgres_url

        # Either way, Vercel/Neon use the bare "postgres://" scheme, which
        # SQLAlchemy 2.0 rejects. Rewrite it to the psycopg3 dialect explicitly
        # so SQLAlchemy doesn't default to the (uninstalled) psycopg2.
        if self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace("postgres://", "postgresql+psycopg://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()
