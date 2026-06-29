from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .auth import create_access_token, get_current_user, hash_password, verify_password
from .database import Base, engine, get_db
from .models import JournalEntry, LibraryItem, SavedAnswer, SavedQuote, User
from .schemas import (
    ChatRequest,
    ChatResponse,
    JournalEntryCreate,
    JournalEntryRead,
    LibraryItemCreate,
    LibraryItemRead,
    LibraryItemUpdate,
    LibraryStats,
    SavedAnswerCreate,
    SavedAnswerRead,
    SavedQuoteCreate,
    SavedQuoteRead,
    Token,
    UserCreate,
    UserRead,
)
from sqlalchemy import text

from .services.books import get_trending, search_books
from .services.groq import ask_book, daily_pick, generate_insights, generate_quote, mood_recommendations, reading_personality


try:
    Base.metadata.create_all(bind=engine)
except Exception as exc:
    print(f"Could not create tables at startup: {exc}")


def _migrate() -> None:
    alters = [
        "ALTER TABLE library_items ADD COLUMN genre VARCHAR(120)",
        "ALTER TABLE library_items ADD COLUMN finished_at DATETIME",
        "ALTER TABLE library_items ADD COLUMN updated_at DATETIME",
    ]
    try:
        with engine.connect() as conn:
            for stmt in alters:
                try:
                    conn.execute(text(stmt))
                    conn.commit()
                except Exception:
                    pass
    except Exception as exc:
        print(f"Could not run migrations at startup: {exc}")


_migrate()

app = FastAPI(title="Bookwise API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=UserRead)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/api/auth/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> Token:
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return Token(access_token=create_access_token(user.email))


@app.get("/api/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@app.get("/api/books/search")
async def books_search(q: str = Query(default=""), mood: str | None = None) -> dict:
    return {"books": await search_books(q, mood)}


@app.get("/api/books/trending")
async def books_trending() -> dict:
    return {"trending": await get_trending()}


@app.get("/api/books/daily-pick")
async def books_daily_pick() -> dict:
    return await daily_pick()


@app.get("/api/books/mood-queries")
async def books_mood_queries(mood: str = Query(min_length=2)) -> dict:
    return {"queries": await mood_recommendations(mood)}


@app.get("/api/books/insights")
async def books_insights(title: str, author: str | None = None, spoilers: bool = False) -> dict:
    return await generate_insights(title, author, spoilers)


@app.get("/api/books/quote")
async def books_quote(title: str, author: str | None = None) -> dict:
    return {"quote": await generate_quote(title, author)}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    answer = await ask_book(payload.book_title, payload.question, payload.spoilers, payload.author)
    return ChatResponse(answer=answer)


@app.get("/api/library", response_model=list[LibraryItemRead])
def list_library(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[LibraryItem]:
    return db.query(LibraryItem).filter(LibraryItem.user_id == current_user.id).order_by(LibraryItem.updated_at.desc()).all()


@app.get("/api/library/stats", response_model=LibraryStats)
def library_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> LibraryStats:
    items = db.query(LibraryItem).filter(LibraryItem.user_id == current_user.id).all()
    reading = sum(1 for i in items if i.status == "reading")
    read = sum(1 for i in items if i.status == "read")
    want = sum(1 for i in items if i.status == "want_to_read")
    year_start = datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)
    books_this_year = sum(
        1 for i in items if i.status == "read" and i.finished_at and i.finished_at.replace(tzinfo=timezone.utc) >= year_start
    )
    genres = sorted({i.genre for i in items if i.genre})
    entries = db.query(JournalEntry).filter(JournalEntry.user_id == current_user.id).order_by(JournalEntry.created_at.desc()).all()
    streak = _reading_streak(entries)
    return LibraryStats(reading=reading, read=read, want_to_read=want, streak_days=streak, books_this_year=books_this_year, genres=genres)


@app.post("/api/library", response_model=LibraryItemRead)
def add_library_item(
    payload: LibraryItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LibraryItem:
    existing = (
        db.query(LibraryItem)
        .filter(LibraryItem.user_id == current_user.id, LibraryItem.title == payload.title)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Book already in library")
    item = LibraryItem(user_id=current_user.id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.patch("/api/library/{item_id}", response_model=LibraryItemRead)
def update_library_item(
    item_id: int,
    payload: LibraryItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LibraryItem:
    item = db.query(LibraryItem).filter(LibraryItem.id == item_id, LibraryItem.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Book not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    if payload.status == "read" and not item.finished_at:
        item.finished_at = datetime.utcnow()
    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item


@app.delete("/api/library/{item_id}")
def delete_library_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = db.query(LibraryItem).filter(LibraryItem.id == item_id, LibraryItem.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Book not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@app.get("/api/saved-answers", response_model=list[SavedAnswerRead])
def list_saved_answers(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[SavedAnswer]:
    return db.query(SavedAnswer).filter(SavedAnswer.user_id == current_user.id).order_by(SavedAnswer.created_at.desc()).all()


@app.post("/api/saved-answers", response_model=SavedAnswerRead)
def save_answer(
    payload: SavedAnswerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedAnswer:
    row = SavedAnswer(user_id=current_user.id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.delete("/api/saved-answers/{answer_id}")
def delete_saved_answer(
    answer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    row = db.query(SavedAnswer).filter(SavedAnswer.id == answer_id, SavedAnswer.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.get("/api/journal", response_model=list[JournalEntryRead])
def list_journal(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[JournalEntry]:
    return db.query(JournalEntry).filter(JournalEntry.user_id == current_user.id).order_by(JournalEntry.created_at.desc()).all()


@app.post("/api/journal", response_model=JournalEntryRead)
def add_journal_entry(
    payload: JournalEntryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JournalEntry:
    row = JournalEntry(user_id=current_user.id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.get("/api/quotes", response_model=list[SavedQuoteRead])
def list_quotes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[SavedQuote]:
    return db.query(SavedQuote).filter(SavedQuote.user_id == current_user.id).order_by(SavedQuote.created_at.desc()).all()


@app.post("/api/quotes", response_model=SavedQuoteRead)
def save_quote(
    payload: SavedQuoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedQuote:
    row = SavedQuote(user_id=current_user.id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.get("/api/reader/personality")
async def reader_personality(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    titles = [i.title for i in db.query(LibraryItem).filter(LibraryItem.user_id == current_user.id).all()]
    return await reading_personality(titles)


def _reading_streak(entries: list[JournalEntry]) -> int:
    if not entries:
        return 0
    days = {e.created_at.date() for e in entries}
    streak = 0
    day = datetime.utcnow().date()
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak
