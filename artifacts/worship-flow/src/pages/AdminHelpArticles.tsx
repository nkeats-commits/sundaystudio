import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import {
  useAdminListHelpArticles,
  useAdminCreateHelpArticle,
  useAdminUpdateHelpArticle,
  useAdminDeleteHelpArticle,
  getAdminListHelpArticlesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  BookOpen,
  X,
  Check,
  Loader2,
} from "lucide-react";

type ArticleForm = {
  slug: string;
  title: string;
  body: string;
  category: string;
  published: boolean;
};

const emptyForm = (): ArticleForm => ({
  slug: "",
  title: "",
  body: "",
  category: "General",
  published: false,
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function ArticleFormModal({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial: ArticleForm & { id?: number };
  onClose: () => void;
  onSave: (form: ArticleForm & { id?: number }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ArticleForm & { id?: number }>(initial);
  const isNew = !form.id;

  function handleTitleChange(title: string) {
    setForm((f) => ({
      ...f,
      title,
      slug: isNew ? slugify(title) : f.slug,
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden"
        style={{
          backgroundColor: "var(--worship-white)",
          borderColor: "var(--worship-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: "var(--worship-border)" }}
        >
          <h2 className="font-serif text-lg font-semibold" style={{ color: "var(--worship-navy)" }}>
            {isNew ? "New article" : "Edit article"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--worship-cream)]"
            style={{ color: "var(--worship-slate)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--worship-navy)" }}>
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Getting started with Service Builder"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2"
              style={{
                borderColor: "var(--worship-border)",
                backgroundColor: "var(--worship-cream)",
                color: "var(--worship-charcoal)",
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--worship-navy)" }}>
                Slug
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="getting-started-service-builder"
                className="w-full px-3 py-2 rounded-lg border text-sm font-mono outline-none focus:ring-2"
                style={{
                  borderColor: "var(--worship-border)",
                  backgroundColor: "var(--worship-cream)",
                  color: "var(--worship-charcoal)",
                }}
              />
              <p className="mt-1 text-xs" style={{ color: "var(--worship-muted-slate)" }}>
                Lowercase letters, numbers, hyphens only
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--worship-navy)" }}>
                Category
              </label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="General"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2"
                style={{
                  borderColor: "var(--worship-border)",
                  backgroundColor: "var(--worship-cream)",
                  color: "var(--worship-charcoal)",
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--worship-navy)" }}>
              Body (Markdown)
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={14}
              placeholder={`## Overview\n\nStart writing your article here. Markdown is supported.\n\n**Bold text**, *italic text*, \`code\`, and lists work.\n\n* Bullet point one\n* Bullet point two`}
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono leading-relaxed outline-none focus:ring-2 resize-y"
              style={{
                borderColor: "var(--worship-border)",
                backgroundColor: "var(--worship-cream)",
                color: "var(--worship-charcoal)",
              }}
            />
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={form.published}
                onClick={() => setForm((f) => ({ ...f, published: !f.published }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.published ? "bg-[var(--worship-navy)]" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    form.published ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm font-medium" style={{ color: "var(--worship-navy)" }}>
                {form.published ? "Published — visible to all users" : "Draft — not visible publicly"}
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0"
          style={{ borderColor: "var(--worship-border)" }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--worship-cream)] disabled:opacity-50"
            style={{ color: "var(--worship-slate)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.slug.trim() || !form.title.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--worship-navy)" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isNew ? "Create article" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminHelpArticles() {
  const queryClient = useQueryClient();
  const { data: articles, isLoading, error } = useAdminListHelpArticles({
    query: { queryKey: getAdminListHelpArticlesQueryKey() },
  });

  const createMut = useAdminCreateHelpArticle({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getAdminListHelpArticlesQueryKey() });
        toast.success("Article created");
        setModal(null);
      },
      onError: () => toast.error("Failed to create article"),
    },
  });

  const updateMut = useAdminUpdateHelpArticle({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getAdminListHelpArticlesQueryKey() });
        toast.success("Article saved");
        setModal(null);
      },
      onError: () => toast.error("Failed to save article"),
    },
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

  const [modal, setModal] = useState<(ArticleForm & { id?: number }) | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const saving = createMut.isPending || updateMut.isPending;

  function handleSave(form: ArticleForm & { id?: number }) {
    if (form.id) {
      updateMut.mutate({ id: form.id, data: form });
    } else {
      createMut.mutate({ data: form });
    }
  }

  const grouped = (articles ?? []).reduce<Record<string, typeof articles>>((acc, a) => {
    const cat = a.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(a);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

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
          <button
            onClick={() => setModal(emptyForm())}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: "var(--worship-navy)" }}
          >
            <Plus className="w-4 h-4" />
            New article
          </button>
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
            <p className="text-sm" style={{ color: "var(--worship-slate)" }}>
              Create your first help article to populate the Help Center.
            </p>
          </div>
        )}

        {categories.map((cat) => (
          <section key={cat}>
            <h2 className="font-serif text-lg font-semibold mb-3" style={{ color: "var(--worship-navy)" }}>
              {cat}
              <span className="ml-2 text-sm font-normal font-sans" style={{ color: "var(--worship-slate)" }}>
                ({grouped[cat]!.length})
              </span>
            </h2>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--worship-border)" }}>
              {grouped[cat]!.map((article, i) => (
                <div
                  key={article.id}
                  className={`flex items-center gap-3 px-5 py-3.5 bg-white transition-colors hover:bg-[var(--worship-cream)]/40 ${
                    i < grouped[cat]!.length - 1 ? "border-b border-[var(--worship-border)]" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--worship-navy)" }}>
                      {article.title}
                    </p>
                    <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--worship-muted-slate)" }}>
                      /{article.slug}
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
                      <><Eye className="w-3 h-3" />Published</>
                    ) : (
                      <><EyeOff className="w-3 h-3" />Draft</>
                    )}
                  </span>
                  <button
                    onClick={() =>
                      setModal({
                        id: article.id,
                        slug: article.slug,
                        title: article.title,
                        body: article.body,
                        category: article.category,
                        published: article.published,
                      })
                    }
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--worship-cream)]"
                    style={{ color: "var(--worship-slate)" }}
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
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
          </section>
        ))}
      </div>

      {modal && (
        <ArticleFormModal
          initial={modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            className="w-full max-w-sm rounded-2xl border shadow-2xl p-6"
            style={{ backgroundColor: "var(--worship-white)", borderColor: "var(--worship-border)" }}
          >
            <h3 className="font-serif text-lg font-semibold mb-2" style={{ color: "var(--worship-navy)" }}>
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
