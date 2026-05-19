import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminSetHelpArticleOrder,
  getAdminListHelpArticlesQueryKey,
} from "@workspace/api-client-react";
import { toast } from "sonner";

interface Article {
  id: number;
  title: string;
  published: boolean;
}

function SortableArticleRow({ article }: { article: Article }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: article.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
      }}
      className="flex items-center gap-3 px-4 py-3 bg-white border-b last:border-b-0 border-[var(--worship-border)] select-none"
    >
      <button
        {...attributes}
        {...listeners}
        className="touch-none cursor-grab active:cursor-grabbing p-0.5 rounded text-slate-300 hover:text-slate-500 transition-colors"
        aria-label="Drag to reorder"
        tabIndex={0}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--worship-navy)" }}>
        {article.title}
      </span>
      {!article.published && (
        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
          Draft
        </span>
      )}
    </div>
  );
}

interface Props {
  category: string;
  articles: Article[];
}

export function ArticleOrderPanel({ category, articles }: Props) {
  const queryClient = useQueryClient();

  const saveMut = useAdminSetHelpArticleOrder({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: getAdminListHelpArticlesQueryKey(),
        });
        toast.success("Article order saved");
      },
      onError: () => toast.error("Failed to save article order"),
    },
  });

  const [localOrder, setLocalOrder] = useState<Article[]>(articles);

  useEffect(() => {
    setLocalOrder(articles);
  }, [articles]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalOrder((prev) => {
        const from = prev.findIndex((a) => a.id === active.id);
        const to = prev.findIndex((a) => a.id === over.id);
        return arrayMove(prev, from, to);
      });
    }
  }

  if (localOrder.length < 2) return null;

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={localOrder.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {localOrder.map((article) => (
            <SortableArticleRow key={article.id} article={article} />
          ))}
        </SortableContext>
      </DndContext>
      <div
        className="flex justify-end px-4 py-3 border-t"
        style={{
          borderColor: "var(--worship-border)",
          backgroundColor: "var(--worship-cream)",
        }}
      >
        <button
          onClick={() =>
            saveMut.mutate({
              data: { category, ids: localOrder.map((a) => a.id) },
            })
          }
          disabled={saveMut.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: "var(--worship-navy)" }}
        >
          <Check className="w-3.5 h-3.5" />
          {saveMut.isPending ? "Saving…" : "Save order"}
        </button>
      </div>
    </div>
  );
}
