import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import {
  useAdminListHelpArticles,
  useAdminDeleteHelpArticle,
  getAdminListHelpArticlesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  BookOpen,
  Download,
  ListOrdered,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { CategoryOrderPanel } from "../components/CategoryOrderPanel";
import { ArticleOrderPanel } from "../components/ArticleOrderPanel";

export default function AdminHelpArticles() {
  const queryClient = useQueryClient();
  const { data: articles, isLoading, error } = useAdminListHelpArticles({
    query: { queryKey: getAdminListHelpArticlesQueryKey() },
  });

  const seedMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/help-articles/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Seed failed");
      return res.json() as Promise<{ inserted: number; skipped: number }>;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: getAdminListHelpArticlesQueryKey() });
      toast.success(`Loaded ${data.inserted} starter articles`);
    },
    onError: () => toast.error("Failed to load starter articles"),
  });

  const deleteMut = useAdminDeleteHelpArticle({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getAdminListHelpArticlesQueryKey() });
        toast.success("Article deleted");
      },
      onError: () => toast.error("Failed to delete article"),
    },
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showCategoryOrder, setShowCategoryOrder] = useState(false);
  const [expandedArticleOrder, setExpandedArticleOrder] = useState<Record<string, boolean>>({});

  function toggleArticleOrder(cat: string) {
    setExpandedArticleOrder((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  const grouped = (articles ?? []).reduce<Record<string, typeof articles>>((acc, a) => {
    const cat = a.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(a);
    return acc;
  }, {});

  // Preserve server-returned order (articles already sorted by position then alpha)
  const categories = Object.keys(grouped);
  const allCategories = [...categories].sort((a, b) => a.localeCompare(b));

  return (
    <AppLayout title="Help Articles">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--worship-border)]">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-sm mb-2 transition-colors hover:opacity-80"
              style={{ color: "var(--worship-slate)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              Admin
            </Link>
            <h1 className="font-serif text-2xl" style={{ color: "var(--worship-navy)" }}>
              Help Articles
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--worship-slate)" }}>
              Manage articles shown at{" "}
              <a
                href="/help"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: "var(--worship-gold)" }}
              >
                /help
              </a>
            </p>
          </div>
          <Link
            href="/admin/help-articles/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: "var(--worship-navy)" }}
          >
            <Plus className="w-4 h-4" />
            New article
          </Link>
        </div>

        {isLoading && (
          <p className="text-sm" style={{ color: "var(--worship-slate)" }}>
            Loading…
          </p>
        )}

        {error && (
          <div className="worship-card border-red-200 bg-red-50 text-red-700 text-sm">
            Failed to load help articles.
          </div>
        )}

        {!isLoading && articles?.length === 0 && (
          <div className="text-center py-16">
            <BookOpen
              className="w-10 h-10 mx-auto mb-3 opacity-30"
              style={{ color: "var(--worship-navy)" }}
            />
            <p className="font-medium text-base mb-2" style={{ color: "var(--worship-navy)" }}>
              No articles yet
            </p>
            <p className="text-sm mb-4" style={{ color: "var(--worship-slate)" }}>
              Load the 24 starter articles or create your own.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => seedMut.mutate()}
                disabled={seedMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: "var(--worship-gold)" }}
              >
                <Download className="w-4 h-4" />
                {seedMut.isPending ? "Loading…" : "Load starter articles"}
              </button>
              <Link
                href="/admin/help-articles/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ color: "var(--worship-navy)", border: "1px solid var(--worship-border)" }}
              >
                <Plus className="w-4 h-4" />
                New article
              </Link>
            </div>
          </div>
        )}

        {categories.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--worship-border)" }}
          >
            <button
              onClick={() => setShowCategoryOrder((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-[var(--worship-cream)]/40 transition-colors text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--worship-navy)" }}>
                <ListOrdered className="w-4 h-4" style={{ color: "var(--worship-gold)" }} />
                Category order
                <span className="text-xs font-normal" style={{ color: "var(--worship-slate)" }}>
                  — drag to reorder how categories appear in the Help Center
                </span>
              </span>
              {showCategoryOrder ? (
                <ChevronUp className="w-4 h-4 shrink-0" style={{ color: "var(--worship-slate)" }} />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--worship-slate)" }} />
              )}
            </button>
            {showCategoryOrder && (
              <div className="border-t" style={{ borderColor: "var(--worship-border)" }}>
                <CategoryOrderPanel allCategories={allCategories} />
              </div>
            )}
          </div>
        )}

        {categories.map((cat) => (
          <section key={cat}>
            <h2
              className="font-serif text-lg font-semibold mb-3"
              style={{ color: "var(--worship-navy)" }}
            >
              {cat}
              <span
                className="ml-2 text-sm font-normal font-sans"
                style={{ color: "var(--worship-slate)" }}
              >
                ({grouped[cat]!.length})
              </span>
            </h2>

            {/* Article rows */}
            <div
              className="rounded-xl border overflow-hidden mb-2"
              style={{ borderColor: "var(--worship-border)" }}
            >
              {grouped[cat]!.map((article, i) => (
                <div
                  key={article.id}
                  className={`flex items-center gap-3 px-5 py-3.5 bg-white transition-colors hover:bg-[var(--worship-cream)]/40 ${
                    i < grouped[cat]!.length - 1
                      ? "border-b border-[var(--worship-border)]"
                      : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--worship-navy)" }}
                    >
                      {article.title}
                    </p>
                    <p
                      className="text-xs mt-0.5 font-mono"
                      style={{ color: "var(--worship-muted-slate)" }}
                    >
                      /help/{article.slug}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      article.published
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {article.published ? (
                      <>
                        <Eye className="w-3 h-3" />
                        Published
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3" />
                        Draft
                      </>
                    )}
                  </span>
                  <Link
                    href={`/admin/help-articles/${article.id}`}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--worship-cream)]"
                    style={{ color: "var(--worship-slate)" }}
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => setDeleteId(article.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-50 hover:text-red-600"
                    style={{ color: "var(--worship-slate)" }}
                    title="Delete"
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Article order toggle — only shown when there are 2+ articles */}
            {grouped[cat]!.length >= 2 && (
              <div
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: "var(--worship-border)" }}
              >
                <button
                  onClick={() => toggleArticleOrder(cat)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-white hover:bg-[var(--worship-cream)]/40 transition-colors text-left"
                >
                  <span
                    className="flex items-center gap-2 text-sm font-medium"
                    style={{ color: "var(--worship-navy)" }}
                  >
                    <ListOrdered
                      className="w-4 h-4"
                      style={{ color: "var(--worship-gold)" }}
                    />
                    Article order
                    <span
                      className="text-xs font-normal"
                      style={{ color: "var(--worship-slate)" }}
                    >
                      — drag to set display order within this category
                    </span>
                  </span>
                  {expandedArticleOrder[cat] ? (
                    <ChevronUp
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--worship-slate)" }}
                    />
                  ) : (
                    <ChevronDown
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--worship-slate)" }}
                    />
                  )}
                </button>
                {expandedArticleOrder[cat] && (
                  <div className="border-t" style={{ borderColor: "var(--worship-border)" }}>
                    <ArticleOrderPanel
                      category={cat}
                      articles={grouped[cat]!.map((a) => ({
                        id: a.id,
                        title: a.title,
                        published: a.published,
                      }))}
                    />
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </div>

      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            className="w-full max-w-sm rounded-2xl border shadow-2xl p-6"
            style={{
              backgroundColor: "var(--worship-white)",
              borderColor: "var(--worship-border)",
            }}
          >
            <h3
              className="font-serif text-lg font-semibold mb-2"
              style={{ color: "var(--worship-navy)" }}
            >
              Delete article?
            </h3>
            <p className="text-sm mb-6" style={{ color: "var(--worship-slate)" }}>
              This cannot be undone. The article will be permanently removed from the Help Center.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--worship-cream)]"
                style={{ color: "var(--worship-slate)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteMut.mutate({ id: deleteId });
                  setDeleteId(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
