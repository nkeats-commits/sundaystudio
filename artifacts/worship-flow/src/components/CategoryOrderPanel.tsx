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
  useAdminGetHelpCategoryOrder,
  useAdminSetHelpCategoryOrder,
  getAdminGetHelpCategoryOrderQueryKey,
  getAdminListHelpArticlesQueryKey,
} from "@workspace/api-client-react";
import { toast } from "sonner";

function SortableRow({ id }: { id: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

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
      <span className="text-sm font-medium" style={{ color: "var(--worship-navy)" }}>
        {id}
      </span>
    </div>
  );
}

interface Props {
  allCategories: string[];
}

export function CategoryOrderPanel({ allCategories }: Props) {
  const queryClient = useQueryClient();

  const { data: orderData, isLoading } = useAdminGetHelpCategoryOrder({
    query: { queryKey: getAdminGetHelpCategoryOrderQueryKey() },
  });

  const saveMut = useAdminSetHelpCategoryOrder({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: getAdminGetHelpCategoryOrderQueryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: getAdminListHelpArticlesQueryKey(),
        });
        toast.success("Category order saved");
      },
      onError: () => toast.error("Failed to save category order"),
    },
  });

  const [localOrder, setLocalOrder] = useState<string[]>([]);

  useEffect(() => {
    const saved = orderData?.order ?? [];
    const remaining = allCategories
      .filter((c) => !saved.includes(c))
      .sort();
    setLocalOrder([...saved.filter((c) => allCategories.includes(c)), ...remaining]);
  }, [orderData, allCategories]);

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
        const from = prev.indexOf(String(active.id));
        const to = prev.indexOf(String(over.id));
        return arrayMove(prev, from, to);
      });
    }
  }

  if (isLoading || localOrder.length === 0) return null;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--worship-border)" }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
          {localOrder.map((cat) => (
            <SortableRow key={cat} id={cat} />
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
          onClick={() => saveMut.mutate({ data: { order: localOrder } })}
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
