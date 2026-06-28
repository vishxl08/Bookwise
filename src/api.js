const TOKEN_KEY = "bookwise_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || `Request failed (${response.status})`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  health: () => request("/api/health"),

  register: (email, password) =>
    request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),

  login: async (email, password) => {
    const body = new URLSearchParams({ username: email, password });
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error("Invalid email or password");
    const data = await response.json();
    setToken(data.access_token);
    return data;
  },

  logout: () => clearToken(),

  me: () => request("/api/me"),

  searchBooks: (q, mood) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (mood) params.set("mood", mood);
    return request(`/api/books/search?${params}`);
  },

  trending: () => request("/api/books/trending"),
  dailyPick: () => request("/api/books/daily-pick"),
  moodQueries: (mood) => request(`/api/books/mood-queries?mood=${encodeURIComponent(mood)}`),

  insights: (title, author, spoilers) => {
    const params = new URLSearchParams({ title, spoilers: String(spoilers) });
    if (author) params.set("author", author);
    return request(`/api/books/insights?${params}`);
  },

  quote: (title, author) => {
    const params = new URLSearchParams({ title });
    if (author) params.set("author", author);
    return request(`/api/books/quote?${params}`);
  },

  chat: (book_title, author, question, spoilers) =>
    request("/api/chat", {
      method: "POST",
      body: JSON.stringify({ book_title, author, question, spoilers }),
    }),

  library: {
    list: () => request("/api/library"),
    stats: () => request("/api/library/stats"),
    add: (book) => request("/api/library", { method: "POST", body: JSON.stringify(book) }),
    update: (id, data) => request(`/api/library/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id) => request(`/api/library/${id}`, { method: "DELETE" }),
  },

  savedAnswers: {
    list: () => request("/api/saved-answers"),
    save: (data) => request("/api/saved-answers", { method: "POST", body: JSON.stringify(data) }),
    remove: (id) => request(`/api/saved-answers/${id}`, { method: "DELETE" }),
  },

  journal: {
    list: () => request("/api/journal"),
    add: (content, book_title) =>
      request("/api/journal", { method: "POST", body: JSON.stringify({ content, book_title }) }),
  },

  quotes: {
    list: () => request("/api/quotes"),
    save: (book_title, quote) =>
      request("/api/quotes", { method: "POST", body: JSON.stringify({ book_title, quote }) }),
  },

  personality: () => request("/api/reader/personality"),
};

export function bookFromResult(result) {
  return {
    title: result.title,
    author: result.author || "Unknown author",
    cover: result.cover_url || null,
    meta: [result.first_publish_year, result.source].filter(Boolean).join(" • "),
    vibe: result.description || "A promising read worth exploring.",
    genre: result.genre || null,
  };
}

export const DEFAULT_COVER = "https://covers.openlibrary.org/b/id/8773134-M.jpg";
