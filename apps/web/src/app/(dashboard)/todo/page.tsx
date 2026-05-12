'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSocketEvent } from '@/hooks/use-socket';
import { Loader2, CheckSquare, Plus, Trash2 } from 'lucide-react';
import { AddPersonDialog } from './_components/add-person-dialog';
import type { TodoPerson } from './_types';

export default function TodoPeoplePickerPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['todo-people'],
    queryFn: () => api.get<TodoPerson[]>('/api/v1/todo/people'),
  });

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['todo-people'] });
  }, [queryClient]);

  useSocketEvent('todo.person.created', invalidate, [invalidate]);
  useSocketEvent('todo.person.updated', invalidate, [invalidate]);
  useSocketEvent('todo.person.deleted', invalidate, [invalidate]);
  useSocketEvent('todo.task.created', invalidate, [invalidate]);
  useSocketEvent('todo.task.updated', invalidate, [invalidate]);
  useSocketEvent('todo.task.deleted', invalidate, [invalidate]);

  const deleteMut = useMutation({
    mutationFn: (personId: string) => api.delete(`/api/v1/todo/people/${personId}`),
    onSuccess: invalidate,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
      </div>
    );
  }

  const people = data ?? [];

  return (
    <div className="-mx-4 px-2 sm:mx-auto sm:px-0 sm:max-w-6xl">
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <div className="flex items-center gap-3">
          <CheckSquare className="h-7 w-7 text-[#DC2626]" />
          <h1 className="text-2xl font-bold text-gray-900">To-Do</h1>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-[#DC2626] px-4 py-2 text-sm font-medium text-white shadow hover:bg-red-700"
        >
          <Plus className="h-4 w-4" />
          شخص جديد
        </button>
      </div>

      {people.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 py-16 text-center text-gray-400">
          <p className="text-sm">لا يوجد أشخاص بعد</p>
          <p className="mt-1 text-xs">اضغط "شخص جديد" بالأعلى للبدء</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {people.map((p) => (
            <div
              key={p.id}
              className="group relative flex flex-col items-center rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm transition hover:shadow-md"
            >
              <Link href={`/todo/${p.id}`} className="flex w-full flex-col items-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#DC2626] to-[#1E3F8B] text-xl font-bold text-white shadow">
                  {p.name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <p className="truncate w-full text-sm font-semibold text-gray-900">{p.name}</p>
                <p className="truncate w-full text-xs text-gray-500">{p.email ?? '—'}</p>
                <div className="mt-3 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  {p.activeTaskCount} {p.activeTaskCount === 1 ? 'task' : 'tasks'}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`حذف ${p.name} وجميع مهامه؟`)) deleteMut.mutate(p.id);
                }}
                className="invisible absolute top-2 end-2 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 group-hover:visible"
                aria-label="Delete person"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {addOpen && <AddPersonDialog onClose={() => setAddOpen(false)} />}
    </div>
  );
}
