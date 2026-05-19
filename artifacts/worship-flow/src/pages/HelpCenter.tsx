import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Search, BookOpen, ChevronRight, HelpCircle, X } from "lucide-react";
import { useListHelpArticles, getListHelpArticlesQueryKey } from "@workspace/api-client-react";

export default function HelpCenter() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const { data: articles, isLoading } = useListHelpArticles(undefined, {
    query: { queryKey: getListHelpArticlesQueryKey() },
  });

  const filtered = useMemo(() => {
    if (!articles) return [];
    const q = debouncedQ.toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q),
    );
  }, [articles, debouncedQ]);

  const grouped = useMemo(() => {
    const acc: Record<string, typeof filtered> = {};
    for (const a of filtered) {
      if (!acc[a.category]) acc[a.category] = [];
      acc[a.category]!.push(a);
    }
    return acc;
  }, [filtered]);

  // Preserve server-returned order (already sorted by position then alpha)
  const categories = Object.keys(grouped);

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--worship-cream, #fbf8f4)" }}
    >
      {/* Top nav bar */}
      <header
        className="border-b px-6 md:px-12 py-4 flex items-center justify-between"
        style={{
          backgroundColor: "var(--worship-white, #fff)",
          borderColor: "var(--worship-border, #ddd0be)",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 font-serif text-lg font-semibold"
          style={{ color: "var(--worship-navy, #111b34)" }}
        >
          <img src="/logo.svg" alt="Sunday Studio" className="w-7 h-7" />
          Sunday Studio
        </Link>
        <Link
          href="/dashboard"
          className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-[var(--worship-cream)]"
          style={{ color: "var(--worship-navy, #111b34)" }}
        >
          Back to app
        </Link>
      </header>

      {/* Hero */}
      <div
        className="py-16 px-6 text-center"
        style={{ backgroundColor: "var(--worship-navy, #111b34)" }}
      >
        <HelpCircle
          className="w-10 h-10 mx-auto mb-4"
          style={{ color: "var(--worship-gold, #c5a471)" }}
        />
        <h1
          className="font-serif text-3xl md:text-4xl font-semibold mb-3"
          style={{ color: "var(--worship-gold, #c5a471)" }}
        >
          Help Center
        </h1>
        <p className="text-slate-300 text-base mb-8 max-w-lg mx-auto">
          Guides and answers to help you get the most from Sunday Studio.
        </p>

        {/* Search */}
        <div className="relative max-w-md mx-auto">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles…"
            className="w-full pl-11 pr-10 py-3 rounded-xl text-sm outline-none border"
            style={{
              backgroundColor: "rgba(255,255,255,0.08)",
              borderColor: "rgba(255,255,255,0.15)",
              color: "white",
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-white"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        {isLoading && (
          <p className="text-center text-sm" style={{ color: "var(--worship-slate)" }}>
            Loading articles…
          </p>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <BookOpen
              className="w-10 h-10 mx-auto mb-3 opacity-30"
              style={{ color: "var(--worship-navy)" }}
            />
            <p className="text-base font-medium" style={{ color: "var(--worship-navy)" }}>
              {debouncedQ ? `No articles match "${debouncedQ}"` : "No articles yet"}
            </p>
            {debouncedQ && (
              <button
                onClick={() => setQuery("")}
                className="mt-3 text-sm underline"
                style={{ color: "var(--worship-gold)" }}
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="space-y-10">
            {categories.map((cat) => (
              <section key={cat}>
                <h2
                  className="font-serif text-xl font-semibold mb-4"
                  style={{ color: "var(--worship-navy)" }}
                >
                  {cat}
                </h2>
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{
                    borderColor: "var(--worship-border)",
                    backgroundColor: "white",
                  }}
                >
                  {grouped[cat]!.map((article, i) => (
                    <button
                      key={article.id}
                      onClick={() => setLocation(`/help/${article.slug}`)}
                      className={`w-full text-left flex items-center justify-between px-5 py-4 transition-colors hover:bg-[var(--worship-cream)] ${
                        i < grouped[cat]!.length - 1
                          ? "border-b border-[var(--worship-border)]"
                          : ""
                      }`}
                    >
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--worship-navy)" }}
                      >
                        {article.title}
                      </span>
                      <ChevronRight
                        className="w-4 h-4 shrink-0 ml-3"
                        style={{ color: "var(--worship-muted-slate, #94a3b8)" }}
                      />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
