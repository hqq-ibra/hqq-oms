'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { ArrowRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useSocketEvent } from '@/hooks/use-socket';
import { AddTaskInput } from '../_components/add-task-input';
import { TaskRow } from '../_components/task-row';
import { DoneSection } from '../_components/done-section';
import type { TodoTasksResponse } from '../_types';

export default function TodoTasksPage() {
  const { personId } = useParams<{ personId: string }>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['todo-tasks', personId],
    queryFn: () => api.get<TodoTasksResponse>(`/api/v1/todo/people/${personId}/tasks`),
  });

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ['todo-tasks', personId] });
  }, [qc, personId]);

  useSocketEvent<{ ownerPersonId: string }>(
    'todo.task.created',
    (d) => d.ownerPersonId === personId && invalidate(),
    [personId, invalidate],
  );
  useSocketEvent<{ ownerPersonId: string }>(
    'todo.task.updated',
    (d) => d.ownerPersonId === personId && invalidate(),
    [personId, invalidate],
  );
  useSocketEvent<{ ownerPersonId: string }>(
    'todo.task.deleted',
    (d) => d.ownerPersonId === personId && invalidate(),
    [personId, invalidate],
  );
  useSocketEvent<{ ownerPersonId: string }>(
    'todo.tasks.reordered',
    (d) => d.ownerPersonId === personId && invalidate(),
    [personId, invalidate],
  );
  useSocketEvent<{ ownerPersonId: string }>(
    'todo.note.created',
    (d) => d.ownerPersonId === personId && invalidate(),
    [personId, invalidate],
  );
  useSocketEvent<{ ownerPersonId: string }>(
    'todo.note.deleted',
    (d) => d.ownerPersonId === personId && invalidate(),
    [personId, invalidate],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.post(`/api/v1/todo/people/${personId}/tasks/reorder`, { orderedIds }),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: ['todo-tasks', personId] });
      const prev = qc.getQueryData<TodoTasksResponse>(['todo-tasks', personId]);
      if (prev) {
        const indexMap = new Map(orderedIds.map((id, idx) => [id, idx]));
        const next: TodoTasksResponse = {
          ...prev,
          active: [...prev.active].sort(
            (a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0),
          ),
        };
        qc.setQueryData(['todo-tasks', personId], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['todo-tasks', personId], ctx.prev);
    },
    onSettled: invalidate,
  });

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id || !data) return;
    const oldIdx = data.active.findIndex((t) => t.id === e.active.id);
    const newIdx = data.active.findIndex((t) => t.id === e.over!.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(data.active, oldIdx, newIdx).map((t) => t.id);
    reorderMut.mutate(reordered);
  };

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
      </div>
    );
  }

  return (
    <div className="-mx-4 px-2 sm:mx-auto sm:px-0 sm:max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        <Link
          href="/todo"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          aria-label="Back"
        >
          <ArrowRight className="h-5 w-5 rtl:rotate-180" />
        </Link>
        <h1 className="text-lg font-bold text-gray-900 sm:text-xl">مهام {data.owner.name}</h1>
      </div>

      <AddTaskInput ownerPersonId={personId} />

      <div className="mt-3">
        <p className="mb-2 text-[11px] font-semibold text-gray-500">
          📌 المهام النشطة ({data.active.length})
        </p>
        {data.active.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 py-8 text-center text-xs text-gray-400">
            لا توجد مهام نشطة. ابدأ بإضافة مهمة من فوق ↑
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={data.active.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {data.active.map((t) => (
                  <TaskRow key={t.id} task={t} ownerPersonId={personId} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <DoneSection tasks={data.done} ownerPersonId={personId} />
    </div>
  );
}
