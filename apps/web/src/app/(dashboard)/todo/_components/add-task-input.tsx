'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Plus, Loader2 } from 'lucide-react';
import type { TodoTask } from '../_types';

export function AddTaskInput({ ownerPersonId }: { ownerPersonId: string }) {
  const qc = useQueryClient();
  const [value, setValue] = React.useState('');

  const mut = useMutation({
    mutationFn: (title: string) =>
      api.post<TodoTask>(`/api/v1/todo/people/${ownerPersonId}/tasks`, { title }),
    onSuccess: () => {
      setValue('');
      qc.invalidateQueries({ queryKey: ['todo-tasks', ownerPersonId] });
    },
  });

  const submit = () => {
    const v = value.trim();
    if (v) mut.mutate(v);
  };

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="أضف مهمة جديدة..."
        className="block w-full rounded-lg border border-gray-300 bg-white py-3 ps-10 pe-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-red-200"
        maxLength={500}
        dir="auto"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim() || mut.isPending}
        className="absolute start-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
        aria-label="Add task"
      >
        {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
      </button>
    </div>
  );
}
