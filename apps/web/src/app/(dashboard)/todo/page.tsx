'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useSocketEvent } from '@/hooks/use-socket';
import { Loader2, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TodoUser } from './_types';

export default function TodoUserPickerPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['todo-users'],
    queryFn: () => api.get<TodoUser[]>('/api/v1/todo/users'),
  });

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['todo-users'] });
  }, [queryClient]);

  useSocketEvent('todo.task.created', invalidate, [invalidate]);
  useSocketEvent('todo.task.updated', invalidate, [invalidate]);
  useSocketEvent('todo.task.deleted', invalidate, [invalidate]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
      </div>
    );
  }

  const users = data ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <CheckSquare className="h-7 w-7 text-[#DC2626]" />
        <h1 className="text-2xl font-bold text-gray-900">To-Do</h1>
      </div>

      {users.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 py-16 text-center text-gray-400">
          <p className="text-sm">لا يوجد مستخدمين بعد</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {users.map((u) => {
            const isSelf = u.id === user?.id;
            return (
              <Link
                key={u.id}
                href={`/todo/${u.id}`}
                className={cn(
                  'flex flex-col items-center rounded-xl border bg-white p-5 text-center shadow-sm transition hover:shadow-md',
                  isSelf ? 'border-[#DC2626] ring-2 ring-red-200' : 'border-gray-200',
                )}
              >
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#DC2626] to-[#1E3F8B] text-xl font-bold text-white shadow">
                  {u.name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <p className="truncate w-full text-sm font-semibold text-gray-900">{u.name}</p>
                <p className="truncate w-full text-xs text-gray-500">{u.email}</p>
                <div className="mt-3 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  {u.activeTaskCount} {u.activeTaskCount === 1 ? 'task' : 'tasks'}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
