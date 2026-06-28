from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings


settings = get_settings()
is_sqlite = settings.database_url.startswith("sqlite")
engine_kwargs = {"connect_args": {"check_same_thread": False} if is_sqlite else {}}
if not is_sqlite:
    # Serverless functions are short-lived; don't hold pooled connections open
    # between invocations against the DB's (often low) connection limit.
    engine_kwargs["poolclass"] = NullPool
engine = create_engine(settings.database_url, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
