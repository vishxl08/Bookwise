from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class UserRead(BaseModel):
    id: int
    email: EmailStr

    model_config = {"from_attributes": True}


class LibraryItemCreate(BaseModel):
    title: str
    author: str | None = None
    cover_url: str | None = None
    genre: str | None = None
    status: str = "want_to_read"
    rating: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = None


class LibraryItemUpdate(BaseModel):
    status: str | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = None
    genre: str | None = None


class LibraryItemRead(LibraryItemCreate):
    id: int
    finished_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class LibraryStats(BaseModel):
    reading: int
    read: int
    want_to_read: int
    streak_days: int
    books_this_year: int
    genres: list[str]


class ChatRequest(BaseModel):
    book_title: str
    author: str | None = None
    question: str
    spoilers: bool = False


class ChatResponse(BaseModel):
    answer: str


class SavedAnswerCreate(BaseModel):
    book_title: str
    question: str
    answer: str


class SavedAnswerRead(SavedAnswerCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class JournalEntryCreate(BaseModel):
    content: str = Field(min_length=1)
    book_title: str | None = None


class JournalEntryRead(JournalEntryCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SavedQuoteCreate(BaseModel):
    book_title: str
    quote: str


class SavedQuoteRead(SavedQuoteCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class InsightResponse(BaseModel):
    chapter_breakdown: list[dict]
    character_map: list[dict]
    themes: list[str]
    writing_style_meter: dict
    mood_graph: list[dict]
    similar_books: list[str]
