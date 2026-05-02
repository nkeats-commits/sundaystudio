import { AppLayout } from '../components/layout/AppLayout';
import { useListLibraryItems, useDeleteLibraryItem, getListLibraryItemsQueryKey } from '@workspace/api-client-react';
import { BookOpen, Music, Mic, Users, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type TabType = "all" | "liturgy" | "song" | "speaking_moment" | "devotional";

export default function Library() {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const { data: items, isLoading } = useListLibraryItems(activeTab !== "all" ? { kind: activeTab } : undefined);
  const deleteItem = useDeleteLibraryItem();
  const queryClient = useQueryClient();

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this item?")) return;
    
    deleteItem.mutate({ id }, {
      onSuccess: () => {
        toast.success("Item removed from library");
        queryClient.invalidateQueries({ queryKey: getListLibraryItemsQueryKey() });
      },
      onError: () => toast.error("Failed to delete item")
    });
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: "all", label: "All" },
    { id: "liturgy", label: "Liturgies" },
    { id: "song", label: "Songs" },
    { id: "speaking_moment", label: "Speaking Moments" },
    { id: "devotional", label: "Devotionals" }
  ];

  const getIcon = (kind: string) => {
    switch (kind) {
      case 'liturgy': return <BookOpen className="w-4 h-4" />;
      case 'song': return <Music className="w-4 h-4" />;
      case 'speaking_moment': return <Mic className="w-4 h-4" />;
      case 'devotional': return <Users className="w-4 h-4" />;
      default: return <BookOpen className="w-4 h-4" />;
    }
  };

  const formatKind = (kind: string) => kind.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return (
    <AppLayout title="Library">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="pb-6 border-b border-[var(--worship-border)]">
          <h1 className="text-2xl font-serif text-[var(--worship-navy)] mb-1">Your Library</h1>
          <p className="text-sm text-[var(--worship-slate)]">Saved liturgies, songs, devotionals, and generated content.</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 border-b border-[var(--worship-border)]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'text-[var(--worship-navy)] border-b-2 border-[var(--worship-navy)] bg-white/50' 
                  : 'text-[var(--worship-slate)] hover:text-[var(--worship-navy)] hover:bg-white/30'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C99A3D]"></div>
          </div>
        ) : !items?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--worship-cream)] flex items-center justify-center mb-4 text-[var(--worship-gold)]">
              <BookOpen className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-serif text-[var(--worship-navy)] mb-2">Nothing here yet</h3>
            <p className="text-[var(--worship-slate)] max-w-sm">
              Use the generators from the Dashboard or Sidebar to create and save content to your library.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {items.map(item => (
              <div key={item.id} className="worship-card p-5 group flex flex-col hover:border-[var(--worship-gold)] transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2 px-2 py-1 bg-[var(--worship-cream)] rounded-md text-xs font-medium text-[var(--worship-slate)]">
                    {getIcon(item.kind)}
                    {formatKind(item.kind)}
                  </div>
                  <button 
                    onClick={(e) => handleDelete(item.id, e)}
                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    title="Delete item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="font-serif text-lg text-[var(--worship-navy)] mb-2">{item.title}</h3>
                
                <div className="text-sm text-[var(--worship-slate)] line-clamp-3 mb-4 flex-1">
                  {item.kind === 'song' && item.content.artist ? (
                    <span className="italic">{String(item.content.artist)}</span>
                  ) : item.content.body ? (
                    String(item.content.body)
                  ) : item.content.reflection ? (
                    String(item.content.reflection)
                  ) : (
                    "No preview available"
                  )}
                </div>

                <div className="flex justify-between items-center mt-auto pt-4 border-t border-[var(--worship-border)]">
                  <span className="text-xs text-[var(--worship-muted-slate)]">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex gap-1">
                      {item.tags.slice(0, 2).map(t => (
                        <span key={t} className="text-[10px] px-2 py-0.5 bg-[var(--worship-sand)] text-[var(--worship-navy)] rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
