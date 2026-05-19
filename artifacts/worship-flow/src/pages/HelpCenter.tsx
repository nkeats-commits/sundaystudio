import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Search, BookOpen, ChevronRight, HelpCircle } from "lucide-react";
import { useListHelpArticles } from "@workspace/api-client-react";

function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const set = (v: T) => {
    if (timerRef[0]) clearTimeout(timerRef[0]);
    timerRef[1](setTimeout(() => setDebounced(v), delay) as ReturnType<typeof setTimeout>);
  };

  return debounced;
}

export default function HelpCenter() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const debouncedQ = useDebounced(query.trim(), 250);

  const { data: articles, isLoading } = useListHelpArticles(
    debouncedQ ? { q: debouncedQ } : undefined,
  );

  const grouped = (articles ?? []).reduce<Record<string, typeof articles>>((acc, a) => {
    if (!a) return acc;
    const cat = a.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(a);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();
  const totalCount = articles?.length ?? 0;

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
          <Search
            className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles…"
            className="w-full pl-11 pr-4 py-3 rounded-xl text-sm outline-none border"
            style={{
              backgroundColor: "rgba(255,255,255,0.08)",
              borderColor: "rgba(255,255,255,0.15)",
              color: "white",
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        {isLoading && (
          <p className="text-center text-sm" style={{ color: "var(--worship-slate)" }}>
            Loading articles…
          </p>
        )}

        {!isLoading && totalCount === 0 && (
          <div className="text-center py-16">
            <BookOpen
              className="w-10 h-10 mx-auto mb-3 opacity-30"
              style={{ color: "var(--worship-navy)" }}
            />
            <p className="text-base font-medium" style={{ color: "var(--worship-navy)" }}>
              {query ? `No articles match "${query}"` : "No articles yet"}
            </p>
            {query && (
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

        {!isLoading && totalCount > 0 && (
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
                      key={article!.id}
                      onClick={() => setLocation(`/help/${article!.slug}`)}
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
                        {article!.title}
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
