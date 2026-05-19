import { Link, useParams } from "wouter";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
import { useGetHelpArticle } from "@workspace/api-client-react";

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3 class="font-serif text-lg font-semibold mt-6 mb-2" style="color:var(--worship-navy)">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-serif text-xl font-semibold mt-8 mb-3" style="color:var(--worship-navy)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-serif text-2xl font-semibold mt-8 mb-4" style="color:var(--worship-navy)">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-[var(--worship-sand)] px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/^\* (.+)$/gm, '<li class="ml-5 list-disc mb-1">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-5 list-decimal mb-1">$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 pl-4 italic text-[var(--worship-slate)] my-4" style="border-color:var(--worship-gold)">$1</blockquote>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="underline" style="color:var(--worship-gold)" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/^(?!<[h|l|b])(.+)/gm, (_, line) => line.trim() ? line : "");
}

export default function HelpArticle() {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading, error } = useGetHelpArticle(slug ?? "");

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

      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link
          href="/help"
          className="inline-flex items-center gap-1.5 text-sm mb-8 transition-colors hover:opacity-80"
          style={{ color: "var(--worship-gold)" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Help Center
        </Link>

        {isLoading && (
          <p className="text-sm" style={{ color: "var(--worship-slate)" }}>
            Loading…
          </p>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-base font-medium" style={{ color: "var(--worship-navy)" }}>
              Article not found
            </p>
            <Link href="/help" className="mt-4 inline-block text-sm underline" style={{ color: "var(--worship-gold)" }}>
              Browse all articles
            </Link>
          </div>
        )}

        {article && (
          <article>
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--worship-sand)",
                  color: "var(--worship-navy)",
                }}
              >
                <Tag className="w-3 h-3" />
                {article.category}
              </span>
            </div>

            <h1
              className="font-serif text-2xl md:text-3xl font-semibold mb-4"
              style={{ color: "var(--worship-navy)" }}
            >
              {article.title}
            </h1>

            <div
              className="flex items-center gap-1.5 text-xs mb-8"
              style={{ color: "var(--worship-muted-slate, #94a3b8)" }}
            >
              <Calendar className="w-3.5 h-3.5" />
              Updated {new Date(article.updatedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </div>

            {article.body ? (
              <div
                className="prose-worship text-[var(--worship-charcoal)] leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: `<p class="mb-4">${renderMarkdown(article.body)}</p>`,
                }}
              />
            ) : (
              <p className="text-sm italic" style={{ color: "var(--worship-slate)" }}>
                This article has no content yet.
              </p>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
