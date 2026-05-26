import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, MessageSquare, Trash2, GripVertical, ChevronDown } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext, useSortable, rectSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFeyData } from '../hooks/useFeyData';
import { getContrastColor } from '../utils/colorContrast';
import { PALETTE } from '../data/defaultClients';


const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'complete', label: 'Most complete' },
  { value: 'manual',  label: 'Manual order' },
];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Plain card (receives optional drag props) ──────────────────────────────

function ThreadCard({ thread, color, onClick, onDelete, dragListeners, dragAttributes }) {
  const textColor = getContrastColor(color);
  const total = thread.tasks.length;
  const done  = thread.tasks.filter((t) => t.done).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      onClick={onClick}
      style={{ backgroundColor: color }}
      className="group rounded-2xl p-4 sm:p-5 cursor-pointer transition-shadow duration-150 hover:shadow-md relative overflow-hidden"
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-white/60"
          style={{ color: textColor }}
        >
          {done}/{total} tasks
        </span>
      </div>

      <h3 className="font-display text-xl font-bold mb-4 leading-tight line-clamp-1" style={{ color: textColor }}>
        {formatDate(thread.message_date)}
      </h3>

      <div className="flex items-center justify-between">
        <div className="flex-1 mr-4">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.4)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: '#ffffff' }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dragListeners && (
            <button
              {...dragListeners}
              {...dragAttributes}
              onClick={(e) => e.stopPropagation()}
              className="w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 bg-white/50 hover:bg-white/80 transition-all cursor-grab active:cursor-grabbing touch-none"
              style={{ color: textColor }}
            >
              <GripVertical size={13} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(thread); }}
            className="w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 bg-white/50 hover:bg-white/80 transition-all"
            style={{ color: textColor }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sortable wrapper ───────────────────────────────────────────────────────

function SortableThreadCard({ thread, color, isDraggingRef, onDelete, onNavigate }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: thread.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = () => {
    if (isDraggingRef.current) return;
    onNavigate(thread.id);
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ThreadCard
        thread={thread}
        color={color}
        onClick={handleClick}
        onDelete={onDelete}
        dragListeners={listeners}
        dragAttributes={attributes}
      />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Fey() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { settings, saveSetting } = useSettings();
  const accent    = settings.accent_color || '#ED64A6';

  const { threads, loading, error, deleteThread } = useFeyData(user?.id);

  // Sort state — persisted in settings
  const [sortMode, setSortMode] = useState(settings.fey_sort_mode || 'newest');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  // Manual order — persisted in settings
  const [explicitOrder, setExplicitOrder] = useState(() => {
    try {
      const parsed = JSON.parse(settings.fey_thread_order);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* ignore */ }
    return null;
  });

  const saveOrder = useCallback(async (ids) => {
    setExplicitOrder(ids);
    await saveSetting('fey_thread_order', JSON.stringify(ids));
  }, [saveSetting]);

  const handleSortChange = useCallback((value) => {
    setSortMode(value);
    setSortDropdownOpen(false);
    saveSetting('fey_sort_mode', value);
  }, [saveSetting]);

  // Apply sort
  const sortedThreads = useMemo(() => {
    if (sortMode === 'manual' && explicitOrder) {
      const orderMap = new Map(explicitOrder.map((id, i) => [id, i]));
      return [...threads].sort((a, b) => {
        const ai = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
        const bi = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
        return ai - bi;
      });
    }
    if (sortMode === 'oldest') {
      return [...threads].sort((a, b) => new Date(a.message_date) - new Date(b.message_date));
    }
    if (sortMode === 'complete') {
      return [...threads].sort((a, b) => {
        const pA = a.tasks.length > 0 ? a.tasks.filter((t) => t.done).length / a.tasks.length : 0;
        const pB = b.tasks.length > 0 ? b.tasks.filter((t) => t.done).length / b.tasks.length : 0;
        return pB - pA;
      });
    }
    // newest (default)
    return [...threads].sort((a, b) => new Date(b.message_date) - new Date(a.message_date));
  }, [threads, sortMode, explicitOrder]);

  // DnD
  const isDraggingRef = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback((event) => {
    setTimeout(() => { isDraggingRef.current = false; }, 0);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids     = sortedThreads.map((t) => t.id);
    const oldIdx  = ids.indexOf(active.id);
    const newIdx  = ids.indexOf(over.id);
    const newOrder = arrayMove(ids, oldIdx, newIdx);
    saveOrder(newOrder);
    // Switch to manual mode automatically on first drag
    if (sortMode !== 'manual') {
      setSortMode('manual');
      saveSetting('fey_sort_mode', 'manual');
    }
  }, [sortedThreads, saveOrder, sortMode, saveSetting]);

  const handleDelete = useCallback((thread) => {
    deleteThread(thread.id);
  }, [deleteThread]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortMode)?.label || 'Newest first';

  if (loading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 page-enter">
        <div className="flex items-center gap-3 mb-8">
          <Sparkles size={22} style={{ color: accent }} />
          <h1 className="font-display text-2xl font-bold text-gray-900">Fey</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-gray-100 h-36 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 lg:p-8 page-enter">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles size={22} style={{ color: accent }} />
          <h1 className="font-display text-2xl font-bold text-gray-900">Fey</h1>
        </div>
        <p className="text-sm text-red-500">Something went wrong. Try refreshing.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Sparkles size={22} style={{ color: accent }} />
          <h1 className="font-display text-2xl font-bold text-gray-900">Fey</h1>
        </div>

        {/* Sort dropdown */}
        {threads.length > 1 && (
          <div className="relative">
            <button
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setDropdownPos({ top: rect.bottom + 4, left: rect.right - 160 });
                setSortDropdownOpen((v) => !v);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                sortMode !== 'newest'
                  ? 'text-white'
                  : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}
              style={sortMode !== 'newest' ? { backgroundColor: accent } : {}}
            >
              {currentSortLabel}
              <ChevronDown size={13} />
            </button>

            {sortDropdownOpen && (
              <div
                className="fixed bg-white rounded-xl shadow-xl border border-gray-100 z-[9999] py-1 w-40"
                style={{ top: dropdownPos.top, left: dropdownPos.left }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSortChange(opt.value)}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      sortMode === opt.value ? 'font-medium' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    style={sortMode === opt.value ? { color: accent } : {}}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-sm text-gray-400 mb-8 pl-9">Your AI task assistant</p>

      {threads.length === 0 ? (
        <div className="text-center py-20">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${accent}15` }}
          >
            <MessageSquare size={24} style={{ color: accent }} />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">No messages yet</h3>
          <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
            Send a WhatsApp message to Fey and your tasks will appear here — with notes and deadlines extracted automatically.
          </p>
          <p className="text-xs text-gray-300 mt-4">Connect your number in Settings → WhatsApp</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          modifiers={[restrictToParentElement]}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortedThreads.map((t) => t.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedThreads.map((thread, i) => (
                <SortableThreadCard
                  key={thread.id}
                  thread={thread}
                  color={PALETTE[i % PALETTE.length]}
                  isDraggingRef={isDraggingRef}
                  onDelete={handleDelete}
                  onNavigate={(id) => navigate(`/fey/${id}`)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Close sort dropdown on outside click */}
      {sortDropdownOpen && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setSortDropdownOpen(false)} />
      )}
    </div>
  );
}
