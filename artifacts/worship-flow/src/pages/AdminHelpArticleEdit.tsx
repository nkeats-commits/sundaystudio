import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Link, useLocation, useParams } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import {
  useAdminListHelpArticles,
  useAdminCreateHelpArticle,
  useAdminUpdateHelpArticle,
  getAdminListHelpArticlesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  Loader2,
  ExternalLink,
  ImageIcon,
} from "lucide-react";

type ArticleForm = {
  slug: string;
  title: string;
  body: string;
  category: string;
  published: boolean;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function AdminHelpArticleEdit() {
  const { id: idParam } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const isNew = !idParam || idParam === "new";
  const articleId = isNew ? null : parseInt(idParam, 10);

  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/help-articles/images`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Upload failed");
      }
      const { url } = await res.json() as { url: string };
      const textarea = textareaRef.current;
      const insertion = `![](${url})`;
      if (textarea) {
        const start = textarea.selectionStart ?? form.body.length;
        const end = textarea.selectionEnd ?? form.body.length;
        const before = form.body.slice(0, start);
        const after = form.body.slice(end);
        const newBody = `${before}${insertion}${after}`;
        setForm((f) => ({ ...f, body: newBody }));
        requestAnimationFrame(() => {
          textarea.selectionStart = start + insertion.length;
          textarea.selectionEnd = start + insertion.length;
          textarea.focus();
        });
      } else {
        setForm((f) => ({ ...f, body: f.body + `\n\n${insertion}` }));
      }
      toast.success("Image uploaded");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload image";
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const listQuery = useAdminListHelpArticles({
    query: { queryKey: getAdminListHelpArticlesQueryKey() },
  });

  const existingArticle = articleId
    ? listQuery.data?.find((a) => a.id === articleId) ?? null
    : null;

  const [form, setForm] = useState<ArticleForm>({
    slug: "",
    title: "",
    body: "",
    category: "General",
    published: false,
  });

  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (existingArticle) {
      setForm({
        slug: existingArticle.slug,
        title: existingArticle.title,
        body: existingArticle.body,
        category: existingArticle.category,
        published: existingArticle.published,
      });
      setSlugManuallyEdited(true);
    }
  }, [existingArticle]);

  const createMut = useAdminCreateHelpArticle({
    mutation: {
      onSuccess: (data) => {
        void queryClient.invalidateQueries({ queryKey: getAdminListHelpArticlesQueryKey() });
        toast.success("Article created");
        setLocation(`/admin/help-articles/${data.id}`);
      },
      onError: (err: unknown) => {
        const message =
          typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: string }).message)
            : "Failed to create article";
        toast.error(message);
      },
    },
  });

  const updateMut = useAdminUpdateHelpArticle({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getAdminListHelpArticlesQueryKey() });
        toast.success("Article saved");
      },
      onError: (err: unknown) => {
        const message =
          typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: string }).message)
            : "Failed to save article";
        toast.error(message);
      },
    },
  });

  const saving = createMut.isPending || updateMut.isPending;

  function handleTitleChange(title: string) {
    setForm((f) => ({
      ...f,
      title,
      slug: slugManuallyEdited ? f.slug : slugify(title),
    }));
  }

  function handleSave() {
    if (!form.title.trim() || !form.slug.trim()) return;
    if (isNew) {
      createMut.mutate({ data: form });
    } else if (articleId) {
      updateMut.mutate({ id: articleId, data: form });
    }
  }

  const loadingArticle = !isNew && listQuery.isLoading;
  const articleNotFound = !isNew && !listQuery.isLoading && !existingArticle && listQuery.data;

  if (loadingArticle) {
    return (
      <AppLayout title={isNew ? "New Article" : "Edit Article"}>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--worship-slate)" }} />
        </div>
      </AppLayout>
    );
  }

  if (articleNotFound) {
    return (
      <AppLayout title="Article Not Found">
        <div className="max-w-xl mx-auto text-center py-24">
          <p className="text-base font-medium mb-4" style={{ color: "var(--worship-navy)" }}>
            Article not found
          </p>
          <Link
            href="/admin/help-articles"
            className="text-sm underline"
            style={{ color: "var(--worship-gold)" }}
          >
            Back to Help Articles
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={isNew ? "New Article" : "Edit Article"}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--worship-border)]">
          <div>
            <Link
              href="/admin/help-articles"
              className="inline-flex items-center gap-1.5 text-sm mb-2 transition-colors hover:opacity-80"
              style={{ color: "var(--worship-slate)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              Help Articles
            </Link>
            <h1 className="font-serif text-2xl" style={{ color: "var(--worship-navy)" }}>
              {isNew ? "New article" : "Edit article"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {!isNew && existingArticle?.published && (
              <a
                href={`/help/${existingArticle.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-[var(--worship-cream)]"
                style={{
                  borderColor: "var(--worship-border)",
                  color: "var(--worship-navy)",
                }}
              >
                <ExternalLink className="w-4 h-4" />
                View live
              </a>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim() || !form.slug.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: "var(--worship-navy)" }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isNew ? "Create article" : "Save changes"}
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-5">
          {/* Title */}
          <div>
            <label
              className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--worship-navy)" }}
            >
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Getting started with Service Builder"
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{
                borderColor: "var(--worship-border)",
                backgroundColor: "var(--worship-cream)",
                color: "var(--worship-charcoal)",
              }}
            />
          </div>

          {/* Slug + Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--worship-navy)" }}
              >
                Slug
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setForm((f) => ({ ...f, slug: e.target.value }));
                }}
                placeholder="getting-started-service-builder"
                className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono outline-none"
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
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--worship-navy)" }}
              >
                Category
              </label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="General"
                className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                style={{
                  borderColor: "var(--worship-border)",
                  backgroundColor: "var(--worship-cream)",
                  color: "var(--worship-charcoal)",
                }}
              />
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                className="block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--worship-navy)" }}
              >
                Body (Markdown)
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors hover:bg-[var(--worship-cream)] disabled:opacity-50"
                style={{ borderColor: "var(--worship-border)", color: "var(--worship-slate)" }}
                title="Upload image"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5" />
                )}
                {uploading ? "Uploading…" : "Image"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageUpload(file);
              }}
            />
            <textarea
              ref={textareaRef}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              readOnly={uploading}
              rows={20}
              placeholder={`## Overview\n\nStart writing your article here. Markdown is supported.\n\n**Bold text**, *italic text*, \`code\`, and lists work.\n\n* Bullet point one\n* Bullet point two\n\nPaste a YouTube or Vimeo URL on its own line to embed a video.`}
              className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono leading-relaxed outline-none resize-y transition-opacity"
              style={{
                borderColor: "var(--worship-border)",
                backgroundColor: "var(--worship-cream)",
                color: "var(--worship-charcoal)",
                opacity: uploading ? 0.6 : 1,
              }}
            />
          </div>

          {/* Publish toggle */}
          <div
            className="flex items-center justify-between p-4 rounded-xl border"
            style={{ borderColor: "var(--worship-border)", backgroundColor: "var(--worship-white)" }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--worship-navy)" }}>
                {form.published ? "Published" : "Draft"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--worship-slate)" }}>
                {form.published
                  ? "Visible to all users at /help"
                  : "Only visible to you as admin"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.published}
              onClick={() => setForm((f) => ({ ...f, published: !f.published }))}
              className={`relative w-11 h-6 rounded-full transition-colors flex items-center shrink-0 ${
                form.published
                  ? "bg-[var(--worship-navy)]"
                  : "bg-slate-200"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  form.published ? "translate-x-5" : "translate-x-0"
                }`}
              />
              <span className="sr-only">{form.published ? "Published" : "Draft"}</span>
            </button>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-2">
            {form.published ? (
              <Eye className="w-4 h-4 text-emerald-600" />
            ) : (
              <EyeOff className="w-4 h-4 text-slate-400" />
            )}
            <span className="text-sm" style={{ color: "var(--worship-slate)" }}>
              {form.published
                ? "This article will appear in the public Help Center"
                : "This article is a draft and will not appear publicly"}
            </span>
          </div>

          {/* Bottom save */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim() || !form.slug.trim()}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: "var(--worship-navy)" }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isNew ? "Create article" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
