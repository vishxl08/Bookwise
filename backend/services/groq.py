import json
import time
from datetime import datetime, timezone

import httpx

from ..config import get_settings

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "llama-3.3-70b-versatile"
_insights_cache: dict[str, tuple[float, dict]] = {}
INSIGHTS_TTL = 900
_trending_cache: tuple[str, list[dict]] | None = None

TRENDING_FALLBACK = [
    {"title": "Piranesi", "genre": "Dreamlike fantasy", "query": "Piranesi Susanna Clarke"},
    {"title": "The Secret History", "genre": "Dark academia", "query": "The Secret History Donna Tartt"},
    {"title": "Project Hail Mary", "genre": "Hopeful sci-fi", "query": "Project Hail Mary Andy Weir"},
    {"title": "Mexican Gothic", "genre": "Gothic horror", "query": "Mexican Gothic Silvia Moreno-Garcia"},
]


def _insights_key(title: str, author: str | None, spoilers: bool) -> str:
    return f"{title.lower()}|{(author or '').lower()}|{spoilers}"


async def ask_book(book_title: str, question: str, spoilers: bool, author: str | None = None) -> str:
    author_note = f" by {author}" if author else ""
    spoiler_instruction = (
        "You MAY include plot details, twists, and ending reveals."
        if spoilers
        else "DO NOT reveal major plot twists, the ending, or key surprises. Focus on themes, character development, and general premise."
    )
    prompt = (
        f"You are Bookwise, a knowledgeable and engaging AI book companion. "
        f"Book: {book_title}{author_note}. "
        f"{spoiler_instruction} "
        f"User question: {question}. "
        f"Provide a detailed, thoughtful answer (3-5 paragraphs) that demonstrates deep understanding of the book. "
        f"Include specific examples, character analysis, thematic discussion, or relevant context as appropriate to the question. "
        f"Be conversational but authoritative, like a well-read literature expert discussing the book."
    )
    answer = await call_groq(prompt)
    if answer:
        return answer
    return (
        f"I'd love to discuss {book_title} with you! However, I'm having trouble accessing my knowledge base right now. "
        f"Please try asking again, or feel free to explore the book's themes, characters, and plot structure through the insights panel."
    )


async def generate_insights(title: str, author: str | None, spoilers: bool) -> dict:
    key = _insights_key(title, author, spoilers)
    cached = _insights_cache.get(key)
    if cached and time.time() - cached[0] < INSIGHTS_TTL:
        return cached[1]

    prompt = (
        "Return valid JSON only with these exact keys:\n"
        "chapter_breakdown: array of {chapter, summary, mood} where mood is 0-100\n"
        "character_map: array of {name, role, relationships: string[]}\n"
        "themes: string array of 4-6 themes and symbols\n"
        "writing_style_meter: {easy: number, complex: number, label: string}\n"
        "mood_graph: array of {chapter, mood}\n"
        "similar_books: string array of 4 real book titles\n"
        f"Book: {title} by {author or 'unknown author'}. Spoilers allowed: {spoilers}. "
        "Provide specific, detailed chapter summaries based on the actual book content."
    )
    answer = await call_groq(prompt, json_mode=True)
    if answer:
        try:
            data = json.loads(answer)
            if data.get("chapter_breakdown") and len(data["chapter_breakdown"]) > 0:
                _insights_cache[key] = (time.time(), data)
                return data
        except json.JSONDecodeError:
            pass

    data = fallback_insights(title, spoilers)
    _insights_cache[key] = (time.time(), data)
    return data


async def daily_pick() -> dict:
    prompt = (
        "Return JSON with keys: title, author, vibe (one sentence), reason (why readers love it today). "
        "Pick one real, well-known literary or popular fiction book that has significant cultural impact."
    )
    answer = await call_groq(prompt, json_mode=True)
    if answer:
        try:
            return json.loads(answer)
        except json.JSONDecodeError:
            pass
    return {
        "title": "The Night Circus",
        "author": "Erin Morgenstern",
        "vibe": "Velvet mystery, rival magicians, and a slow-burning romance.",
        "reason": "A perfect blend of atmosphere, wonder, and emotional depth.",
    }


async def generate_trending() -> list[dict]:
    global _trending_cache
    today = datetime.now(timezone.utc).date().isoformat()
    if _trending_cache and _trending_cache[0] == today:
        return _trending_cache[1]

    prompt = (
        "Return JSON with key 'books' containing array of 4 objects. "
        "Each object must have: title, genre, query (search query with author name). "
        "Pick 4 diverse, well-known books from different genres (fantasy, mystery, sci-fi, literary). "
        "Use real book titles and author names."
    )
    answer = await call_groq(prompt, json_mode=True)
    if answer:
        try:
            data = json.loads(answer)
            if data.get("books") and len(data["books"]) > 0:
                _trending_cache = (today, data["books"])
                return data["books"]
        except json.JSONDecodeError:
            pass
    _trending_cache = (today, TRENDING_FALLBACK)
    return TRENDING_FALLBACK


async def mood_recommendations(mood: str) -> list[str]:
    prompt = f'Return JSON {{"queries": ["search query 1", "search query 2", "search query 3"]}} for books matching mood: "{mood}". Use real author names in queries.'
    answer = await call_groq(prompt, json_mode=True)
    if answer:
        try:
            return json.loads(answer).get("queries", [])[:3]
        except json.JSONDecodeError:
            pass
    return [f"{mood} literary fiction", f"{mood} bestseller novel", f"{mood} acclaimed book"]


async def reading_personality(book_titles: list[str]) -> dict:
    if not book_titles:
        return {"type": "Curious Explorer", "description": "Add books to your library and journal to discover your reader personality."}
    titles = ", ".join(book_titles[:12])
    prompt = (
        f'Based on these books the reader enjoys: {titles}. '
        'Return JSON: {"type": "2-3 word reader type", "description": "2 sentences", "traits": ["trait1","trait2","trait3"]}'
    )
    answer = await call_groq(prompt, json_mode=True)
    if answer:
        try:
            return json.loads(answer)
        except json.JSONDecodeError:
            pass
    return {"type": "Literary Wanderer", "description": "You chase atmosphere and emotional depth across genres.", "traits": ["Curious", "Reflective", "Adventurous"]}


async def generate_quote(book_title: str, author: str | None = None) -> str:
    prompt = f'Write one beautiful, original literary quote inspired by the themes of "{book_title}" by {author or "unknown"}. One sentence only, no attribution.'
    answer = await call_groq(prompt)
    return answer or f"Some stories ask us to read slowly — {book_title} is one of them."


async def call_groq(prompt: str, json_mode: bool = False) -> str | None:
    settings = get_settings()
    if not settings.groq_api_key:
        print("GROQ API key not configured")
        return None

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "Be precise, literary, useful, and concise."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 1500,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(
                GROQ_CHAT_URL,
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                json=payload,
            )
        if response.status_code != 200:
            print(f"GROQ API error: {response.status_code} - {response.text}")
            return None
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"GROQ API exception: {e}")
        return None


def fallback_insights(title: str, spoilers: bool) -> dict:
    return {
        "chapter_breakdown": [],
        "character_map": [],
        "themes": [],
        "writing_style_meter": {"easy": 50, "complex": 50, "label": "Unknown"},
        "mood_graph": [],
        "similar_books": [],
    }
