'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { formatRelative } from './format-time';
import type { TodoNote, TodoTask } from '../_types';

export function TaskNotes({ task, ownerPersonId }: { task: TodoTask; ownerPersonId: string }) {
  const qc = useQueryClient();
  const [showAll, setShowAll] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const allQuery = useQuery({
    queryKey: ['todo-task-notes', task.id],
    queryFn: () => api.get<TodoNote[]>(`/api/v1/todo/tasks/${task.id}/notes`),
    enabled: showAll,
  });

  const notes = showAll && allQuery.data ? allQuery.data : task.notes;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['todo-tasks', ownerPersonId] });
    qc.invalidateQueries({ queryKey: ['todo-task-notes', task.id] });
  };

  const addMut = useMutation({
    mutationFn: (content: string) =>
      api.post<TodoNote>(`/api/v1/todo/tasks/${task.id}/notes`, { content }),
    onSuccess: () => {
      setDraft('');
      invalidate();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (noteId: string) => api.delete(`/api/v1/todo/notes/${noteId}`),
    onSuccess: invalidate,
  });

  const remaining = task._count.notes - notes.length;

  return (
    <div className="mt-3 rounded-lg bg-gray-50 p-3">
      <p className="mb-2 text-xs font-semibold text-gray-500">
        💬 آخر التحديثات ({task._count.notes})
      </p>

      {notes.length === 0 ? (
        <p className="py-2 text-xs text-gray-400">لا يوجد تحديثات</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="group flex gap-2 text-sm">
              <span className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-mono text-gray-500 border border-gray-200">
                {formatRelative(n.createdAt)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-gray-800 break-words whitespace-pre-wrap">{n.content}</span>
                <span className="ms-2 text-xs text-gray-500">— {n.createdBy?.name ?? '(محذوف)'}</span>
              </span>
              <button
                type="button"
                onClick={() => deleteMut.mutate(n.id)}
                className="invisible shrink-0 rounded p-1 text-gray-400 hover:text-red-500 group-hover:visible"
                aria-label="Delete note"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!showAll && remaining > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs font-medium text-blue-600 hover:underline"
        >
          عرض الكل ({task._count.notes})
        </button>
      )}
      {showAll && allQuery.isLoading && (
        <Loader2 className="my-2 h-4 w-4 animate-spin text-gray-400" />
      )}

      <div className="mt-2 flex gap-2">
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft.trim()) {
              addMut.mutate(draft.trim());
            }
          }}
          placeholder="أضف تحديث..."
          className="min-h-[36px] flex-1 resize-y rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-red-200"
          maxLength={2000}
        />
        <button
          type="button"
          onClick={() => draft.trim() && addMut.mutate(draft.trim())}
          disabled={!draft.trim() || addMut.isPending}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#DC2626] text-white shadow disabled:opacity-50"
          aria-label="Send"
        >
          {addMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
