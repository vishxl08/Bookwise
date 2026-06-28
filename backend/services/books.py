import asyncio
import time

import httpx

from ..config import get_settings
from .groq import generate_trending

OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json"
GOOGLE_BOOKS_SEARCH = "https://www.googleapis.com/books/v1/volumes"
CACHE_TTL = 600
_search_cache: dict[str, tuple[float, list[dict]]] = {}


async def get_trending() -> list[dict]:
    return await generate_trending()


def _cache_get(key: str) -> list[dict] | None:
    entry = _search_cache.get(key)
    if entry and time.time() - entry[0] < CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, books: list[dict]) -> list[dict]:
    if books:
        _search_cache[key] = (time.time(), books)
    return books


async def search_books(query: str, mood: str | None = None) -> list[dict]:
    search_term = (query or mood or "literary fiction").strip()
    cache_key = search_term.lower()
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=6.0) as client:
        ol_task = asyncio.create_task(_fetch_open_library(client, search_term))
        google_task = asyncio.create_task(_fetch_google_books(client, search_term))

        try:
            done, pending = await asyncio.wait(
                {ol_task, google_task},
                return_when=asyncio.FIRST_COMPLETED,
                timeout=6.0,
            )
            for task in done:
                books = task.result()
                if books:
                    for p in pending:
                        p.cancel()
                    return _cache_set(cache_key, books)

            for task in pending:
                try:
                    books = await asyncio.wait_for(task, timeout=4.0)
                    if books:
                        return _cache_set(cache_key, books)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    pass
        except asyncio.TimeoutError:
            ol_task.cancel()
            google_task.cancel()

    return []


async def _fetch_open_library(client: httpx.AsyncClient, query: str) -> list[dict]:
    response = await client.get(OPEN_LIBRARY_SEARCH, params={"q": query, "limit": 8, "fields": "title,author_name,first_publish_year,cover_i,first_sentence"})
    if response.status_code != 200:
        return []
    docs = response.json().get("docs", [])
    return [normalize_open_library(doc) for doc in docs[:8]]


async def _fetch_google_books(client: httpx.AsyncClient, query: str) -> list[dict]:
    settings = get_settings()
    params = {"q": query, "maxResults": 8}
    if settings.google_books_api_key:
        params["key"] = settings.google_books_api_key

    try:
        response = await client.get(GOOGLE_BOOKS_SEARCH, params=params)
    except httpx.TimeoutException:
        return []

    if response.status_code != 200:
        return []
    return [normalize_google_book(item) for item in response.json().get("items", [])]


def normalize_open_library(doc: dict) -> dict:
    cover_id = doc.get("cover_i")
    return {
        "title": doc.get("title"),
        "author": ", ".join(doc.get("author_name", [])[:2]) if doc.get("author_name") else None,
        "first_publish_year": doc.get("first_publish_year"),
        "cover_url": f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else None,
        "source": "Open Library",
        "description": doc.get("first_sentence", [None])[0] if isinstance(doc.get("first_sentence"), list) else None,
    }


def normalize_google_book(item: dict) -> dict:
    info = item.get("volumeInfo", {})
    image_links = info.get("imageLinks", {})
    return {
        "title": info.get("title"),
        "author": ", ".join(info.get("authors", [])[:2]) if info.get("authors") else None,
        "first_publish_year": (info.get("publishedDate") or "")[:4] or None,
        "cover_url": image_links.get("thumbnail") or image_links.get("smallThumbnail"),
        "source": "Google Books",
        "description": (info.get("description") or "")[:280] or None,
    }
