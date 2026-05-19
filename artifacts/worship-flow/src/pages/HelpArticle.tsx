import { Link, useParams } from "wouter";
import { ArrowLeft, Calendar, Tag, EyeOff } from "lucide-react";
import { useGetHelpArticle, useAdminListHelpArticles, getAdminListHelpArticlesQueryKey } from "@workspace/api-client-react";
import { useIsOwner } from "../hooks/useIsOwner";

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol === "javascript:" || parsed.protocol === "data:") return "#";
    return parsed.href;
  } catch {
    return "#";
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildVideoEmbed(url: string): string | null {
  const ytMatch = url.match(/youtube\.com\/watch\?.*?v=([\w-]+)/) ?? url.match(/youtu\.be\/([\w-]+)/);
  if (ytMatch) {
    const embedUrl = `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`;
    return `<div class="my-6 rounded-xl overflow-hidden" style="position:relative;padding-bottom:56.25%;height:0"><iframe src="${escapeAttr(embedUrl)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allowfullscreen loading="lazy" title="Video"></iframe></div>`;
  }
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    const embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return `<div class="my-6 rounded-xl overflow-hidden" style="position:relative;padding-bottom:56.25%;height:0"><iframe src="${escapeAttr(embedUrl)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allowfullscreen loading="lazy" title="Video"></iframe></div>`;
  }
  return null;
}

function renderMarkdown(md: string): string {
  // PASS 1: extract images and bare video URLs into tokens BEFORE HTML-escaping
  // so that special characters in URLs (& etc.) are never mangled.
  const mediaTokens: string[] = [];

  function tokenize(html: string): string {
    const idx = mediaTokens.length;
    mediaTokens.push(html);
    return `\x00MEDIA_${idx}\x00`;
  }

  // Bare YouTube / Vimeo URLs on their own line
  let processed = md.replace(
    /^(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?|youtu\.be\/|vimeo\.com\/)[\w?=&%#/-]+)\s*$/gm,
    (_m, url: string) => {
      const embed = buildVideoEmbed(url);
      return embed ? tokenize(embed) : url;
    },
  );

  // Markdown image syntax: ![alt](url)
  processed = processed.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_m, alt: string, rawUrl: string) => {
      const safe = escapeAttr(sanitizeUrl(rawUrl));
      const safeAlt = escapeAttr(alt);
      return tokenize(
        `<img src="${safe}" alt="${safeAlt}" class="w-full rounded-lg my-6" style="display:block" />`,
      );
    },
  );

  // PASS 2: run the standard Markdown pipeline (HTML-escape + transforms)
  let html = processed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3 class="font-serif text-lg font-semibold mt-6 mb-2" style="color:var(--worship-navy)">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-serif text-xl font-semibold mt-8 mb-3" style="color:var(--worship-navy)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-serif text-2xl font-semibold mt-8 mb-4" style="color:var(--worship-navy)">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="bg-[var(--worship-sand)] px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/^\* (.+)$/gm, '<li class="ml-5 list-disc mb-1">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-5 list-decimal mb-1">$1</li>')
    .replace(
      /^> (.+)$/gm,
      '<blockquote class="border-l-4 pl-4 italic text-[var(--worship-slate)] my-4" style="border-color:var(--worship-gold)">$1</blockquote>',
    )
    .replace(/\[(.+?)\]\((.+?)\)/g, (_match, text, rawUrl) => {
      const safe = escapeAttr(sanitizeUrl(rawUrl));
      return `<a href="${safe}" class="underline" style="color:var(--worship-gold)" target="_blank" rel="noopener noreferrer">${text}</a>`;
    })
    .replace(/\n\n/g, '</p><p class="mb-4">');

  // PASS 3: restore media tokens
  html = html.replace(/\x00MEDIA_(\d+)\x00/g, (_m, idx) => mediaTokens[parseInt(idx, 10)] ?? "");

  return html;
}

export default function HelpArticle() {
  const { slug } = useParams<{ slug: string }>();
  const { isOwner } = useIsOwner();

  const publicQuery = useGetHelpArticle(slug ?? "");

  const adminQuery = useAdminListHelpArticles({
    query: {
      queryKey: getAdminListHelpArticlesQueryKey(),
      enabled: isOwner && (!!publicQuery.error || publicQuery.isError),
    },
  });

  const draftArticle = adminQuery.data?.find((a) => a.slug === slug);
  const article = publicQuery.data ?? draftArticle ?? null;
  const isDraft = !publicQuery.data && !!draftArticle;

  const isLoading = publicQuery.isLoading || (isOwner && adminQuery.isLoading);
  const notFound = !isLoading && !article && publicQuery.isError;

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

      {/* Draft banner — shown only to owners when article is unpublished */}
      {isDraft && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-2">
          <EyeOff className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 font-medium">
            Draft — this article is not published and only visible to you as an admin.{" "}
            <Link
              href={`/admin/help-articles/${draftArticle!.id}`}
              className="underline hover:opacity-80"
            >
              Edit article
            </Link>
          </p>
        </div>
      )}

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

        {notFound && (
          <div className="text-center py-16">
            <p className="text-base font-medium" style={{ color: "var(--worship-navy)" }}>
              Article not found
            </p>
            <Link
              href="/help"
              className="mt-4 inline-block text-sm underline"
              style={{ color: "var(--worship-gold)" }}
            >
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
              {isDraft && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  <EyeOff className="w-3 h-3" />
                  Draft
                </span>
              )}
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
              Updated{" "}
              {new Date(article.updatedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </div>

            {article.body ? (
              <div
                className="text-[var(--worship-charcoal)] leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: `<p class="mb-4">${renderMarkdown(article.body)}</p>`,
                }}
              />
            ) : (
              <p className="text-sm italic" style={{ color: "var(--worship-slate)" }}>
                This article has no content yet.
              </p>
            )}

            {isOwner && (
              <div className="mt-10 pt-6 border-t" style={{ borderColor: "var(--worship-border)" }}>
                <Link
                  href={`/admin/help-articles/${article.id}`}
                  className="text-sm underline"
                  style={{ color: "var(--worship-slate)" }}
                >
                  Edit this article (admin)
                </Link>
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
