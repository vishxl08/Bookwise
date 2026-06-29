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

        # Neon URLs come back as "postgres://" or "postgresql://" depending on
        # source, with no driver specified -- SQLAlchemy then defaults to the
        # (uninstalled) psycopg2. Normalize to the psycopg3 dialect explicitly,
        # regardless of which scheme spelling was given.
        scheme, sep, rest = self.database_url.partition("://")
        if scheme in ("postgres", "postgresql"):
            self.database_url = f"postgresql+psycopg{sep}{rest}"

        # Neon rejects non-SSL connections; make sure it's always requested.
        if self.database_url.startswith("postgresql+psycopg://") and "sslmode=" not in self.database_url:
            separator = "&" if "?" in self.database_url else "?"
            self.database_url = f"{self.database_url}{separator}sslmode=require"


@lru_cache
def get_settings() -> Settings:
    return Settings()
