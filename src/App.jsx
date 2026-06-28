import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  BookOpen,
  Bookmark,
  Brain,
  CalendarDays,
  Check,
  Heart,
  Library,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  Moon,
  PenLine,
  Quote,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
  Users,
  Wand2,
  X
} from "lucide-react";
import { api, bookFromResult, DEFAULT_COVER, getToken } from "./api";
import { useDebounced } from "./hooks";

const STATUS_LABELS = {
  reading: "Currently Reading",
  read: "Read",
  want_to_read: "Want to Read"
};

function App() {
  const [tab, setTab] = useState("discover");
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(!getToken());
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 350);
  const [mood, setMood] = useState("");
  const [spoilers, setSpoilers] = useState(false);
  const [activeTab, setActiveTab] = useState("breakdown");
  const [selectedBook, setSelectedBook] = useState(null);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [dailyPick, setDailyPick] = useState(null);
  const [trending, setTrending] = useState([]);

  const [library, setLibrary] = useState([]);
  const [stats, setStats] = useState(null);
  const [personality, setPersonality] = useState(null);

  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState([]);

  const [journalEntries, setJournalEntries] = useState([]);
  const [journalInput, setJournalInput] = useState("");
  const [quotes, setQuotes] = useState([]);

  const loadUser = useCallback(async () => {
    if (!getToken()) return;
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      api.logout();
      setUser(null);
    }
  }, []);

  const loadLibrary = useCallback(async () => {
    if (!getToken()) return;
    const [items, s, p, answers, journal, savedQuotes] = await Promise.allSettled([
      api.library.list(),
      api.library.stats(),
      api.personality(),
      api.savedAnswers.list(),
      api.journal.list(),
      api.quotes.list()
    ]);
    if (items.status === "fulfilled") setLibrary(items.value);
    if (s.status === "fulfilled") setStats(s.value);
    if (p.status === "fulfilled") setPersonality(p.value);
    if (answers.status === "fulfilled") setSavedAnswers(answers.value);
    if (journal.status === "fulfilled") setJournalEntries(journal.value);
    if (savedQuotes.status === "fulfilled") setQuotes(savedQuotes.value);
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (user) {
      loadLibrary();
      api.trending().then((d) => setTrending(d.trending || [])).catch(() => {});
      api.dailyPick().then(setDailyPick).catch(() => {});
    }
  }, [user, loadLibrary]);

  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2) return;
    let cancelled = false;
    setSearching(true);
    api.searchBooks(debouncedQuery)
      .then((d) => { if (!cancelled) setResults(d.books || []); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  useEffect(() => {
    if (!selectedBook?.title) return;
    let cancelled = false;
    setInsights(null);
    setInsightsLoading(true);
    setMessages([{ role: "assistant", text: `Ask me anything about "${selectedBook.title}". Spoiler mode is ${spoilers ? "on" : "off"}.` }]);
    api.insights(selectedBook.title, selectedBook.author, spoilers)
      .then((d) => { if (!cancelled) setInsights(d); })
      .catch(() => { if (!cancelled) setInsights(null); })
      .finally(() => { if (!cancelled) setInsightsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBook?.title]);


  const selectBook = (book) => {
    setSelectedBook(book);
    setTab("discover");
    setActiveTab("breakdown");
  };

  const selectResult = (result) => {
    const book = bookFromResult(result);
    setSelectedBook(book);
    setTab("discover");
    setActiveTab("breakdown");
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await api.searchBooks(query);
      setResults(data.books || []);
      if (data.books?.[0]) selectResult(data.books[0]);
    } finally {
      setSearching(false);
    }
  };

  const handleMoodSearch = async () => {
    setSearching(true);
    try {
      const { queries } = await api.moodQueries(mood);
      const searchQuery = queries?.[0] || mood;
      const data = await api.searchBooks(searchQuery, mood);
      setResults(data.books || []);
      if (data.books?.[0]) selectResult(data.books[0]);
    } finally {
      setSearching(false);
    }
  };

  const handleTrendingClick = async (item) => {
    setSearching(true);
    try {
      const data = await api.searchBooks(item.query || item.title);
      setResults(data.books || []);
      const match = data.books?.find((b) => b.title?.toLowerCase().includes(item.title.toLowerCase())) || data.books?.[0];
      if (match) selectResult(match);
      else selectBook({ title: item.title, author: "", cover: DEFAULT_COVER, meta: item.genre, vibe: item.genre, genre: item.genre });
    } finally {
      setSearching(false);
    }
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !selectedBook || chatLoading) return;
    const question = chatInput.trim();
    const next = [...messages, { role: "user", text: question }];
    setMessages(next);
    setChatInput("");
    setChatLoading(true);
    try {
      const data = await api.chat(selectedBook.title, selectedBook.author, question, spoilers);
      setMessages([...next, { role: "assistant", text: data.answer, question }]);
    } catch {
      setMessages([...next, { role: "assistant", text: "Could not reach AI. Check your connection and try again.", question }]);
    } finally {
      setChatLoading(false);
    }
  };

  const saveAnswer = async (msg) => {
    if (!user) { setAuthOpen(true); return; }
    await api.savedAnswers.save({ book_title: selectedBook.title, question: msg.question, answer: msg.text });
    loadLibrary();
  };

  const addToLibrary = async () => {
    if (!user) { setAuthOpen(true); return; }
    if (!selectedBook) return;
    try {
      await api.library.add({
        title: selectedBook.title,
        author: selectedBook.author,
        cover_url: selectedBook.cover,
        genre: selectedBook.genre || selectedBook.meta?.split("•")[0]?.trim(),
        status: "want_to_read"
      });
      loadLibrary();
    } catch (err) {
      alert(err.message);
    }
  };

  const saveQuote = async () => {
    if (!user) { setAuthOpen(true); return; }
    if (!selectedBook) return;
    const { quote } = await api.quote(selectedBook.title, selectedBook.author);
    await api.quotes.save({ book_title: selectedBook.title, quote });
    loadLibrary();
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      if (authMode === "register") await api.register(authEmail, authPassword);
      await api.login(authEmail, authPassword);
      const me = await api.me();
      setUser(me);
      setAuthOpen(false);
      setAuthEmail("");
      setAuthPassword("");
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const moodAverage = useMemo(() => {
    const graph = insights?.mood_graph || insights?.chapter_breakdown;
    if (!graph?.length) return 64;
    return Math.round(graph.reduce((s, c) => s + (c.mood || 0), 0) / graph.length);
  }, [insights]);

  return (
    <main className="min-h-screen overflow-x-hidden font-body">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-5 sm:px-6 lg:px-8">
        <Nav
          tab={tab}
          setTab={setTab}
          user={user}
          onLogin={() => { setAuthMode("login"); setAuthOpen(true); }}
          onLogout={() => { api.logout(); setUser(null); setLibrary([]); }}
        />

        {tab === "discover" && (
          <>
            <HeroSection
              query={query}
              setQuery={setQuery}
              onSubmit={handleSearchSubmit}
              dailyPick={dailyPick}
              moodAverage={moodAverage}
              insights={insights}
            />
            {/* Search Results - shown immediately under search bar */}
            {results.length > 0 && (
              <section className="paper rounded-md border border-cocoa/15 p-5 shadow-paper">
                <h3 className="mb-3 font-display text-2xl font-bold">Search Results</h3>
                {searching ? (
                  <div className="flex items-center gap-2 font-semibold text-cocoa">
                    <Loader2 size={18} className="animate-spin" /> Finding the right shelf...
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {results.slice(0, 6).map((result) => (
                      <button
                        key={`${result.title}-${result.author}`}
                        onClick={() => selectResult(result)}
                        className="rounded-sm border border-cocoa/15 bg-white/45 p-3 text-left transition duration-300 hover:border-brass page-turn"
                      >
                        <p className="font-display text-lg font-bold">{result.title}</p>
                        <p className="text-sm font-semibold text-cocoa">{result.author || "Unknown author"}</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
            <section className="grid gap-6 lg:grid-cols-[1fr_0.4fr] md:grid-cols-[1fr_0.5fr]">
              {/* Main content - left side */}
              <div className="space-y-6">
                <BookPage
                  book={selectedBook}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  spoilers={spoilers}
                  setSpoilers={setSpoilers}
                  results={results}
                  searching={searching}
                  insights={insights}
                  insightsLoading={insightsLoading}
                  onSelectResult={selectResult}
                  onAddLibrary={addToLibrary}
                  user={user}
                />
                <ChatPanel
                  messages={messages}
                  input={chatInput}
                  setInput={setChatInput}
                  sendMessage={sendMessage}
                  spoilers={spoilers}
                  setSpoilers={setSpoilers}
                  loading={chatLoading}
                  onSaveAnswer={saveAnswer}
                  user={user}
                  onSaveQuote={saveQuote}
                />
              </div>
              {/* Sidebar - right side */}
              <Sidebar
                mood={mood}
                setMood={setMood}
                onMoodSearch={handleMoodSearch}
                trending={trending}
                onTrendingClick={handleTrendingClick}
                stats={stats}
                user={user}
                onOpenAuth={() => setAuthOpen(true)}
                onGoLibrary={() => setTab("library")}
              />
            </section>
          </>
        )}

        {tab === "library" && (
          <LibraryView
            user={user}
            library={library}
            stats={stats}
            personality={personality}
            savedAnswers={savedAnswers}
            quotes={quotes}
            onOpenAuth={() => setAuthOpen(true)}
            onSelectBook={(item) => selectBook({
              title: item.title,
              author: item.author || "Unknown",
              cover: item.cover_url || DEFAULT_COVER,
              meta: item.genre || item.status,
              vibe: item.notes || "",
              genre: item.genre
            })}
            onUpdate={async (id, data) => { await api.library.update(id, data); loadLibrary(); }}
            onRemove={async (id) => { await api.library.remove(id); loadLibrary(); }}
          />
        )}

        {tab === "journal" && (
          <JournalView
            user={user}
            entries={journalEntries}
            input={journalInput}
            setInput={setJournalInput}
            selectedBook={selectedBook}
            onOpenAuth={() => setAuthOpen(true)}
            onSubmit={async () => {
              if (!journalInput.trim()) return;
              await api.journal.add(journalInput, selectedBook?.title);
              setJournalInput("");
              loadLibrary();
            }}
            stats={stats}
            personality={personality}
          />
        )}
      </div>

      {authOpen && (
        <AuthModal
          mode={authMode}
          setMode={setAuthMode}
          email={authEmail}
          setEmail={setAuthEmail}
          password={authPassword}
          setPassword={setAuthPassword}
          error={authError}
          onSubmit={handleAuth}
          onClose={() => setAuthOpen(false)}
        />
      )}
    </main>
  );
}

function Nav({ tab, setTab, user, onLogin, onLogout }) {
  const tabs = [
    ["discover", "Discover"],
    ["library", "Library"],
    ["journal", "Journal"]
  ];
  return (
    <nav className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-sm bg-ink text-cream shadow-paper">
          <BookOpen size={23} strokeWidth={1.5} />
        </div>
        <div>
          <p className="font-display text-2xl font-bold leading-none">Bookwise</p>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cocoa">AI book companion</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-cocoa/20 bg-cream/70 p-1 text-sm font-semibold text-cocoa">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-full px-3 py-2 text-xs sm:px-4 sm:text-sm transition duration-300 ${tab === id ? "bg-ink text-cream" : "hover:bg-parchment/60"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {user ? (
          <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-full border border-cocoa/20 px-3 py-2 text-xs font-semibold text-cocoa hover:bg-parchment/60 sm:px-4 sm:text-sm">
            <LogOut size={14} className="sm:size-16" /> <span className="hidden sm:inline">{user.email.split("@")[0]}</span>
          </button>
        ) : (
          <button onClick={onLogin} className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-2 text-xs font-bold text-cream sm:px-4 sm:text-sm">
            <LogIn size={14} className="sm:size-16" /> Sign in
          </button>
        )}
      </div>
    </nav>
  );
}

function HeroSection({ query, setQuery, onSubmit, dailyPick, moodAverage, insights }) {
  return (
    <section className="grid gap-6 lg:grid-cols-1">
      <div className="flex min-h-[280px] flex-col justify-between rounded-md border border-cocoa/15 bg-gradient-to-br from-ink/95 to-cocoa/90 p-5 shadow-paper sm:min-h-[320px] sm:p-8">
        <div className="text-center text-cream">
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-5xl lg:text-6xl">What do you want to read today?</h1>
          <p className="mt-3 max-w-2xl mx-auto text-sm leading-6 text-cream/90 sm:text-base sm:leading-7">
            Search any book, describe a mood, and get AI chapter breakdowns, character maps, themes, chat, and buy or borrow links.
          </p>
        </div>
        <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-md bg-white/95 p-4 shadow-xl sm:mt-8 sm:grid-cols-[1fr_auto] sm:p-5">
          <label className="flex min-h-14 items-center gap-3 rounded-sm border-2 border-cocoa/20 bg-white px-4 focus-within:border-berry transition-colors">
            <Search className="shrink-0 text-cocoa" size={22} strokeWidth={1.5} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, author, or ISBN..."
              className="w-full bg-transparent text-base font-semibold text-ink outline-none placeholder:text-cocoa/50"
            />
          </label>
          <button type="submit" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-sm bg-berry px-8 text-base font-bold text-cream transition-all duration-300 hover:bg-ink shadow-lg hover:shadow-xl">
            <Wand2 size={20} strokeWidth={1.5} /> Search
          </button>
        </form>
        <div className="mt-4 text-center">
          <p className="text-xs text-cream/70 sm:text-sm">Try: "The Great Gatsby", "dark academia", "hopeful sci-fi"</p>
        </div>
      </div>
    </section>
  );
}

function Sidebar({ mood, setMood, onMoodSearch, trending, onTrendingClick, stats, user, onOpenAuth, onGoLibrary }) {
  return (
    <div className="space-y-6">
      <Panel title="Mood Search" icon={Moon}>
        <p className="mb-3 text-xs sm:text-sm text-cocoa">Describe a vibe — AI finds matching books.</p>
        <div className="flex gap-2">
          <input
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="dark & mysterious, cozy, hopeful..."
            className="min-h-10 w-full rounded-sm border border-cocoa/20 bg-white/55 px-3 text-sm font-semibold outline-none focus:border-brass sm:min-h-12 sm:px-4 sm:text-base"
          />
          <button onClick={onMoodSearch} className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-cocoa text-cream transition hover:bg-ink sm:h-12 sm:w-12">
            <Search size={16} strokeWidth={1.5} className="sm:size-19" />
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {["cozy & warm", "dark academia", "hopeful sci-fi", "gothic horror"].map((m) => (
            <button key={m} onClick={() => { setMood(m); }} className="rounded-sm border border-cocoa/10 bg-white/40 px-2 py-1.5 text-left text-xs font-semibold text-cocoa hover:border-brass sm:px-3 sm:py-2 sm:text-sm">
              {m}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Trending by Genre" icon={Sparkles}>
        <div className="grid gap-3">
          {trending.map((book) => (
            <button
              key={book.title}
              onClick={() => onTrendingClick(book)}
              className="flex items-center justify-between rounded-sm border border-cocoa/15 bg-white/45 px-3 py-2 text-left transition duration-300 hover:border-brass page-turn sm:px-4 sm:py-3"
            >
              <span>
                <span className="block font-display text-base font-bold sm:text-lg">{book.title}</span>
                <span className="text-xs font-semibold text-cocoa sm:text-sm">{book.genre}</span>
              </span>
              <Star size={14} className="text-berry sm:size-16" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="My Library" icon={Library}>
        {user && stats ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
              <MiniMetric label="Reading" value={stats.reading} />
              <MiniMetric label="Read" value={stats.read} />
              <MiniMetric label="Streak" value={`${stats.streak_days}d`} />
            </div>
            <p className="mt-3 text-center text-xs font-semibold text-cocoa sm:text-sm">{stats.books_this_year} books read this year</p>
            <button onClick={onGoLibrary} className="mt-4 w-full rounded-sm bg-ink py-2 text-sm font-bold text-cream sm:py-3">Open Library</button>
          </>
        ) : (
          <>
            <p className="text-xs text-cocoa sm:text-sm">Sign in to track reading, notes, ratings, and streaks.</p>
            <button onClick={onOpenAuth} className="mt-4 w-full rounded-sm bg-ink py-2 text-sm font-bold text-cream sm:py-3">Sign in to save books</button>
          </>
        )}
      </Panel>
    </div>
  );
}

function BookPage({ book, activeTab, setActiveTab, spoilers, setSpoilers, results, searching, insights, insightsLoading, onSelectResult, onAddLibrary, user }) {
  if (!book) {
    return (
      <section className="paper flex min-h-48 items-center justify-center rounded-md border border-cocoa/15 p-6 shadow-paper sm:min-h-64 sm:p-8">
        <p className="text-sm font-semibold text-cocoa sm:text-base">Search or pick a book to begin.</p>
      </section>
    );
  }

  const tabs = [
    ["breakdown", "Breakdown"],
    ["characters", "Characters"],
    ["themes", "Themes"],
    ["similar", "Similar"],
    ["links", "Buy/Borrow"]
  ];

  return (
    <section className="paper rounded-md border border-cocoa/15 p-4 shadow-paper sm:p-5">
      <div className="grid gap-4 md:grid-cols-[150px_1fr] sm:gap-5">
        {book.cover ? (
          <img src={book.cover} alt="" className="h-40 w-full rounded-sm object-cover shadow-paper sm:h-56" />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-sm border-2 border-dashed border-cocoa/30 bg-cream/50 sm:h-56">
            <BookOpen size={32} className="text-cocoa/50 sm:size-48" strokeWidth={1} />
          </div>
        )}
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-berry sm:text-sm">Book Page</p>
              <h2 className="mt-1 font-display text-xl font-bold leading-tight sm:mt-2 sm:text-3xl lg:text-4xl">{book.title}</h2>
              <p className="mt-1 text-sm font-semibold text-cocoa sm:mt-2">{book.author}</p>
              <p className="mt-0.5 text-xs font-semibold text-ink/60 sm:mt-1 sm:text-sm">{book.meta}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cocoa/20 bg-white/55 px-2 py-1.5 text-xs font-bold text-cocoa sm:gap-2 sm:px-4 sm:py-2 sm:text-sm">
                <input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} className="accent-berry" />
                Spoilers
              </label>
              <button onClick={onAddLibrary} className="inline-flex items-center gap-1.5 rounded-full bg-berry px-2 py-1.5 text-xs font-bold text-cream sm:gap-2 sm:px-4 sm:py-2 sm:text-sm">
                <BookMarked size={12} className="sm:size-16" /> {user ? "Save" : "Sign in"}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`rounded-full px-2 py-1.5 text-xs font-bold transition duration-300 sm:px-4 sm:py-2 sm:text-sm ${activeTab === id ? "bg-ink text-cream" : "border border-cocoa/20 bg-white/50 text-cocoa"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 min-h-40 rounded-sm border border-cocoa/15 bg-white/45 p-3 sm:mt-4 sm:min-h-56 sm:p-4">
            {insightsLoading ? (
              <div className="flex items-center gap-2 font-semibold text-cocoa sm:gap-3">
                <Loader2 size={16} className="animate-spin sm:size-20" /> <span className="text-xs sm:text-sm">Loading AI analysis...</span>
              </div>
            ) : (
              <>
                {activeTab === "breakdown" && <ChapterBreakdown insights={insights} spoilers={spoilers} />}
                {activeTab === "characters" && <CharacterMap insights={insights} />}
                {activeTab === "themes" && <Themes insights={insights} />}
                {activeTab === "similar" && <SimilarBooks insights={insights} />}
                {activeTab === "links" && <BuyBorrow book={book} />}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ChapterBreakdown({ insights, spoilers }) {
  const chapters = insights?.chapter_breakdown || [];
  if (!chapters.length) return <p className="text-sm text-cocoa">No breakdown available yet. Search for a book to see AI-powered chapter analysis.</p>;
  return (
    <div className="grid gap-4">
      {chapters.map((ch) => (
        <div key={ch.chapter} className="grid gap-3 sm:grid-cols-[130px_1fr]">
          <div>
            <p className="font-display text-lg font-bold">{ch.chapter}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-fog">
                <div className="h-2 rounded-full bg-berry transition-all duration-500" style={{ width: `${ch.mood || 50}%` }} />
              </div>
              <span className="text-xs font-bold text-berry">{ch.mood || 50}%</span>
            </div>
          </div>
          <p className="text-sm leading-6 text-ink/75">{spoilers ? ch.summary : (ch.summary?.includes("Spoiler") ? ch.summary : `Spoiler-safe: ${ch.summary}`)}</p>
        </div>
      ))}
      {insights?.mood_graph && (
        <div className="mt-2 rounded-sm border border-cocoa/10 bg-cream/50 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-berry">Mood Graph</p>
          <div className="mt-2 flex items-end gap-2 h-16">
            {insights.mood_graph.map((m) => (
              <div key={m.chapter} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-berry/80 transition-all duration-500" style={{ height: `${(m.mood || 50) * 0.6}px` }} />
                <span className="text-[10px] font-semibold text-cocoa truncate w-full text-center">{String(m.chapter ?? "").slice(0, 8)} ({m.mood || 50}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CharacterMap({ insights }) {
  const chars = insights?.character_map || [];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {chars.map((c) => (
        <div key={c.name} className="rounded-sm border border-cocoa/15 bg-cream/70 p-4 page-turn">
          <p className="font-display text-xl font-bold">{c.name}</p>
          <p className="mt-1 text-sm font-semibold text-cocoa">{c.role}</p>
          {Array.isArray(c.relationships) && c.relationships.length > 0 && (
            <p className="mt-2 text-xs text-ink/60">↔ {c.relationships.join(", ")}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Themes({ insights }) {
  const themes = insights?.themes || [];
  const meter = insights?.writing_style_meter || { easy: 35, complex: 65, label: "layered" };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {themes.map((t) => (
          <div key={t} className="rounded-sm bg-cream/75 px-4 py-3 font-bold text-cocoa">{t}</div>
        ))}
      </div>
      <div className="rounded-sm border border-cocoa/15 bg-white/45 p-4">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-berry">Writing Style Meter — {meter.label}</p>
        <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm font-bold text-cocoa">
          <span>Easy</span>
          <div className="h-2 rounded-full bg-fog">
            <div className="h-2 rounded-full bg-brass transition-all duration-500" style={{ width: `${meter.complex || 65}%` }} />
          </div>
          <span>Complex</span>
        </div>
      </div>
    </div>
  );
}

function SimilarBooks({ insights }) {
  const books = insights?.similar_books || [];
  return (
    <ul className="space-y-2">
      {books.map((b) => (
        <li key={b} className="flex items-center gap-2 rounded-sm bg-cream/70 px-4 py-3 font-semibold text-ink">
          <Heart size={16} className="text-berry" strokeWidth={1.5} /> {b}
        </li>
      ))}
    </ul>
  );
}

function BuyBorrow({ book }) {
  const title = encodeURIComponent(`${book.title} ${book.author || ""}`);
  return (
    <div className="grid gap-2 sm:gap-3 sm:grid-cols-3">
      <a className="rounded-sm bg-ink px-3 py-3 text-center text-xs font-bold text-cream transition hover:bg-cocoa sm:px-4 sm:py-4 sm:text-sm" href={`https://www.amazon.in/s?k=${title}`} target="_blank" rel="noreferrer">Amazon.in</a>
      <a className="rounded-sm bg-cocoa px-3 py-3 text-center text-xs font-bold text-cream transition hover:bg-ink sm:px-4 sm:py-4 sm:text-sm" href={`https://www.flipkart.com/search?q=${title}`} target="_blank" rel="noreferrer">Flipkart</a>
      <a className="rounded-sm bg-olive px-3 py-3 text-center text-xs font-bold text-cream transition hover:bg-cocoa sm:px-4 sm:py-4 sm:text-sm" href={`https://books.google.co.in/books?q=${title}`} target="_blank" rel="noreferrer">Google Books</a>
    </div>
  );
}

function ChatPanel({ messages, input, setInput, sendMessage, spoilers, setSpoilers, loading, onSaveAnswer, user, onSaveQuote }) {
  return (
    <section className="paper rounded-md border border-cocoa/15 p-4 shadow-paper sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <MessageCircle size={16} className="text-berry sm:size-20" strokeWidth={1.5} />
          <h2 className="font-display text-xl font-bold sm:text-3xl">Chat with Book</h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-cocoa sm:gap-2 sm:text-sm">
            <input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} className="accent-berry" />
            Spoiler mode
          </label>
          {user && (
            <button onClick={onSaveQuote} className="inline-flex items-center gap-1 rounded-full border border-cocoa/20 px-2 py-1 text-xs font-bold text-cocoa hover:bg-parchment/60 sm:gap-1 sm:px-3 sm:py-1 sm:text-sm">
              <Quote size={12} className="sm:size-14" /> Save quote
            </button>
          )}
        </div>
      </div>
      <div className="thin-scrollbar flex max-h-56 flex-col gap-2 overflow-auto rounded-sm border border-cocoa/15 bg-white/45 p-3 sm:max-h-72 sm:gap-3 sm:p-4">
        {messages.map((msg, i) => (
          <div key={i} className={`group max-w-[88%] rounded-sm px-3 py-2 text-xs leading-5 sm:px-4 sm:py-3 sm:text-sm sm:leading-6 ${msg.role === "user" ? "ml-auto bg-ink text-cream" : "bg-cream text-ink"}`}>
            {msg.text}
            {msg.role === "assistant" && msg.question && user && (
              <button onClick={() => onSaveAnswer(msg)} className="mt-2 flex items-center gap-1 text-[10px] font-bold text-berry opacity-70 hover:opacity-100 sm:text-xs">
                <Bookmark size={10} className="sm:size-12" /> Save answer
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-cocoa sm:text-sm">
            <Loader2 size={14} className="animate-spin sm:size-16" /> Thinking...
          </div>
        )}
      </div>
      <div className="mt-2 grid gap-2 sm:mt-3 sm:grid-cols-[1fr_auto]">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask anything about this book"
          className="min-h-12 resize-none rounded-sm border border-cocoa/20 bg-white/55 px-3 py-2 text-sm font-semibold outline-none focus:border-brass sm:min-h-14 sm:px-4 sm:py-3"
        />
        <button onClick={sendMessage} disabled={loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sm bg-berry px-3 text-sm font-bold text-cream disabled:opacity-50 sm:min-h-14 sm:px-5">
          <Send size={14} className="sm:size-17" /> Send
        </button>
      </div>
    </section>
  );
}

function LibraryView({ user, library, stats, personality, savedAnswers, quotes, onOpenAuth, onSelectBook, onUpdate, onRemove }) {
  if (!user) {
    return (
      <section className="paper rounded-md border border-cocoa/15 p-12 text-center shadow-paper">
        <Library size={48} className="mx-auto text-berry" strokeWidth={1.5} />
        <h2 className="mt-4 font-display text-3xl font-bold">Your Personal Library</h2>
        <p className="mt-2 text-cocoa">Sign in to save books, rate them, add notes, and track your reading streak.</p>
        <button onClick={onOpenAuth} className="mt-6 rounded-sm bg-ink px-8 py-3 font-bold text-cream">Sign in</button>
      </section>
    );
  }

  const shelves = ["reading", "read", "want_to_read"];

  return (
    <div className="space-y-6">
      <section className="paper rounded-md border border-cocoa/15 p-6 shadow-paper">
        <h2 className="font-display text-3xl font-bold">My Library</h2>
        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <MiniMetric label="Reading" value={stats.reading} />
            <MiniMetric label="Read" value={stats.read} />
            <MiniMetric label="Want to Read" value={stats.want_to_read} />
            <MiniMetric label="Streak" value={`${stats.streak_days}d`} />
            <MiniMetric label="This Year" value={stats.books_this_year} />
          </div>
        )}
        {personality && (
          <div className="mt-6 rounded-sm border border-cocoa/15 bg-white/45 p-4">
            <p className="text-sm font-bold uppercase tracking-wider text-berry">Reading Personality</p>
            <p className="mt-2 font-display text-2xl font-bold">{personality.type}</p>
            <p className="mt-1 text-sm text-cocoa">{personality.description}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(personality.traits || []).map((t) => (
                <span key={t} className="rounded-full bg-parchment px-3 py-1 text-xs font-bold text-cocoa">{t}</span>
              ))}
            </div>
          </div>
        )}
        {stats?.genres?.length > 0 && (
          <div className="mt-4 rounded-sm border border-cocoa/15 bg-white/45 p-4">
            <p className="text-sm font-bold uppercase tracking-wider text-berry">Genre Passport</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {stats.genres.map((g) => (
                <span key={g} className="rounded-full border border-cocoa/20 px-3 py-1 text-sm font-semibold">{g}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      {shelves.map((status) => {
        const items = library.filter((i) => i.status === status);
        if (!items.length) return null;
        return (
          <Panel key={status} title={STATUS_LABELS[status]} icon={BookOpen}>
            <div className="grid gap-4">
              {items.map((item) => (
                <div key={item.id} className="flex flex-wrap gap-4 rounded-sm border border-cocoa/15 bg-white/45 p-4">
                  <img src={item.cover_url || DEFAULT_COVER} alt="" className="h-24 w-16 rounded-sm object-cover" />
                  <div className="min-w-0 flex-1">
                    <button onClick={() => onSelectBook(item)} className="font-display text-xl font-bold hover:text-berry">{item.title}</button>
                    <p className="text-sm font-semibold text-cocoa">{item.author}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["reading", "read", "want_to_read"].map((s) => (
                        <button
                          key={s}
                          onClick={() => onUpdate(item.id, { status: s })}
                          className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === s ? "bg-ink text-cream" : "border border-cocoa/20 text-cocoa"}`}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => onUpdate(item.id, { rating: n })}>
                          <Star size={18} className={item.rating >= n ? "fill-berry text-berry" : "text-fog"} strokeWidth={1.5} />
                        </button>
                      ))}
                    </div>
                    <textarea
                      defaultValue={item.notes || ""}
                      onBlur={(e) => onUpdate(item.id, { notes: e.target.value })}
                      placeholder="Private notes..."
                      className="mt-2 w-full rounded-sm border border-cocoa/15 bg-white/60 p-2 text-sm outline-none focus:border-brass"
                      rows={2}
                    />
                  </div>
                  <button onClick={() => onRemove(item.id)} className="text-cocoa hover:text-berry"><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          </Panel>
        );
      })}

      {savedAnswers.length > 0 && (
        <Panel title="Saved AI Answers" icon={Bookmark}>
          <div className="space-y-3">
            {savedAnswers.map((a) => (
              <div key={a.id} className="rounded-sm bg-white/45 p-3 text-sm">
                <p className="font-bold text-berry">{a.book_title}</p>
                <p className="mt-1 font-semibold">{a.question}</p>
                <p className="mt-1 text-cocoa">{a.answer.slice(0, 200)}...</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {quotes.length > 0 && (
        <Panel title="Saved Quotes" icon={Quote}>
          <div className="space-y-3">
            {quotes.map((q) => (
              <blockquote key={q.id} className="rounded-sm border-l-4 border-berry bg-cream/70 p-4 italic">
                <p>&ldquo;{q.quote}&rdquo;</p>
                <footer className="mt-2 text-sm font-semibold not-italic text-cocoa">— {q.book_title}</footer>
              </blockquote>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function JournalView({ user, entries, input, setInput, selectedBook, onOpenAuth, onSubmit, stats, personality }) {
  if (!user) {
    return (
      <section className="paper rounded-md border border-cocoa/15 p-12 text-center shadow-paper">
        <PenLine size={48} className="mx-auto text-berry" strokeWidth={1.5} />
        <h2 className="mt-4 font-display text-3xl font-bold">Reading Journal</h2>
        <p className="mt-2 text-cocoa">Sign in to write daily entries and build your reading streak.</p>
        <button onClick={onOpenAuth} className="mt-6 rounded-sm bg-ink px-8 py-3 font-bold text-cream">Sign in</button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="paper rounded-md border border-cocoa/15 p-6 shadow-paper">
        <div className="flex items-center gap-3">
          <CalendarDays size={24} className="text-berry" />
          <h2 className="font-display text-3xl font-bold">Reading Journal</h2>
        </div>
        {stats && <p className="mt-2 text-sm font-semibold text-cocoa">{stats.streak_days}-day reading streak • {stats.books_this_year} books this year</p>}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What did you read today? How did it make you feel?"
          className="mt-4 w-full rounded-sm border border-cocoa/20 bg-white/55 p-4 font-semibold outline-none focus:border-brass"
          rows={4}
        />
        {selectedBook && <p className="mt-2 text-sm text-cocoa">Linked to: <strong>{selectedBook.title}</strong></p>}
        <button onClick={onSubmit} className="mt-3 rounded-sm bg-ink px-6 py-3 font-bold text-cream">Save Entry</button>
      </section>

      {personality && (
        <section className="paper rounded-md border border-cocoa/15 p-5 shadow-paper">
          <p className="text-sm font-bold uppercase tracking-wider text-berry">Your Reader Type</p>
          <p className="mt-2 font-display text-2xl font-bold">{personality.type}</p>
          <p className="mt-1 text-cocoa">{personality.description}</p>
        </section>
      )}

      <Panel title="Past Entries" icon={PenLine}>
        {entries.length ? entries.map((e) => (
          <div key={e.id} className="mb-4 rounded-sm border border-cocoa/10 bg-white/45 p-4">
            <p className="text-xs font-bold uppercase text-cocoa">{new Date(e.created_at).toLocaleDateString()}</p>
            {e.book_title && <p className="text-sm font-semibold text-berry">{e.book_title}</p>}
            <p className="mt-2 text-sm leading-6">{e.content}</p>
          </div>
        )) : <p className="text-cocoa">No entries yet. Write your first one above.</p>}
      </Panel>
    </div>
  );
}

function AuthModal({ mode, setMode, email, setEmail, password, setPassword, error, onSubmit, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="paper w-full max-w-md rounded-md border border-cocoa/20 p-6 shadow-paper">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">{mode === "login" ? "Welcome back" : "Create account"}</h2>
          <button onClick={onClose} className="text-cocoa hover:text-ink"><X size={20} /></button>
        </div>
        <p className="mt-2 text-sm text-cocoa">Secure access to your library, journal, and saved answers.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className="w-full rounded-sm border border-cocoa/20 bg-white/60 px-4 py-3 font-semibold outline-none focus:border-brass" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ chars)" required minLength={8} className="w-full rounded-sm border border-cocoa/20 bg-white/60 px-4 py-3 font-semibold outline-none focus:border-brass" />
          {error && <p className="text-sm font-semibold text-berry">{error}</p>}
          <button type="submit" className="w-full rounded-sm bg-ink py-3 font-bold text-cream">{mode === "login" ? "Sign in" : "Register & sign in"}</button>
        </form>
        <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="mt-4 w-full text-sm font-semibold text-cocoa hover:text-berry">
          {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="paper rounded-md border border-cocoa/15 p-5 shadow-paper">
      <div className="mb-4 flex items-center gap-3">
        <Icon size={20} className="text-berry" strokeWidth={1.5} />
        <h2 className="font-display text-3xl font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-sm border border-cocoa/15 bg-white/45 p-3">
      <Icon size={18} className="mb-2 text-berry" strokeWidth={1.5} />
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-cocoa">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-sm bg-ink px-2 py-4 text-cream">
      <p className="font-display text-3xl font-bold">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream/75">{label}</p>
    </div>
  );
}

export default App;
