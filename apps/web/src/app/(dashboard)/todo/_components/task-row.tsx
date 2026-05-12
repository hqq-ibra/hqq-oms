'use client';

import * as React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { GripVertical, ChevronDown, ChevronUp, Trash2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PriorityPill } from './priority-pill';
import { TaskNotes } from './task-notes';
import type { TodoPriority, TodoTask, TodoTasksResponse } from '../_types';

export function TaskRow({
  task,
  ownerPersonId,
  sortable = true,
}: {
  task: TodoTask;
  ownerPersonId: string;
  sortable?: boolean;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(task.title);

  const sort = useSortable({ id: task.id, disabled: !sortable });
  const style: React.CSSProperties = sortable
    ? {
        transform: CSS.Transform.toString(sort.transform),
        transition: sort.transition,
        opacity: sort.isDragging ? 0.6 : 1,
      }
    : {};

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['todo-tasks', ownerPersonId] });

  const patchMut = useMutation({
    mutationFn: (dto: { title?: string; priority?: TodoPriority; isDone?: boolean }) =>
      api.patch(`/api/v1/todo/tasks/${task.id}`, dto),
    onMutate: async (dto) => {
      await qc.cancelQueries({ queryKey: ['todo-tasks', ownerPersonId] });
      const prev = qc.getQueryData<TodoTasksResponse>(['todo-tasks', ownerPersonId]);
      qc.setQueryData<TodoTasksResponse>(['todo-tasks', ownerPersonId], (old) => {
        if (!old) return old;
        const update = (list: TodoTask[]) =>
          list.map((t) => (t.id === task.id ? { ...t, ...dto } : t));
        return { ...old, active: update(old.active), done: update(old.done) };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['todo-tasks', ownerPersonId], ctx.prev);
    },
    onSettled: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/todo/tasks/${task.id}`),
    onSuccess: invalidate,
  });

  const submitTitle = () => {
    const v = titleDraft.trim();
    if (v && v !== task.title) patchMut.mutate({ title: v });
    setEditing(false);
  };

  return (
    <li
      ref={sortable ? sort.setNodeRef : undefined}
      style={style}
      className={cn(
        'flex flex-col rounded-lg border bg-white shadow-sm transition',
        task.isDone ? 'opacity-70 border-gray-200' : 'border-gray-300 hover:border-gray-400',
      )}
    >
      <div className="flex items-center gap-2 p-2">
        {sortable && (
          <button
            type="button"
            {...sort.attributes}
            {...sort.listeners}
            aria-label="Drag to reorder"
            className="touch-none flex h-11 w-9 shrink-0 cursor-grab items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}

        <PriorityPill
          value={task.priority}
          disabled={task.isDone}
          onChange={(p) => patchMut.mutate({ priority: p })}
        />

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="min-w-0 flex-1 cursor-pointer text-start"
        >
          {editing ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={submitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitTitle();
                if (e.key === 'Escape') {
                  setTitleDraft(task.title);
                  setEditing(false);
                }
              }}
              className="w-full bg-transparent text-sm text-gray-900 focus:outline-none border-b border-gray-300"
              maxLength={500}
            />
          ) : (
            <span
              className={cn(
                'block truncate text-sm',
                task.isDone ? 'line-through text-gray-400' : 'text-gray-900',
              )}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              {task.title}
            </span>
          )}
          {task._count.notes > 0 && (
            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gray-500">
              <MessageSquare className="h-3 w-3" /> {task._count.notes}
            </span>
          )}
        </button>

        <input
          type="checkbox"
          checked={task.isDone}
          onChange={(e) => patchMut.mutate({ isDone: e.target.checked })}
          aria-label={task.isDone ? 'Mark as not done' : 'Mark as done'}
          className="h-6 w-6 shrink-0 cursor-pointer rounded border-gray-300 text-[#DC2626] focus:ring-red-300"
        />

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex h-11 w-9 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-200 p-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this task and all its notes?')) deleteMut.mutate();
              }}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> حذف المهمة
            </button>
          </div>
          <TaskNotes task={task} ownerPersonId={ownerPersonId} />
        </div>
      )}
    </li>
  );
}
