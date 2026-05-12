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
    <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 shadow-sm focus-within:border-[#DC2626] focus-within:ring-1 focus-within:ring-red-200">
      <Plus className="h-5 w-5 shrink-0 text-gray-400" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="أضف مهمة جديدة..."
        className="min-h-[36px] flex-1 bg-transparent text-sm text-gray-900 focus:outline-none"
        maxLength={500}
        dir="auto"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim() || mut.isPending}
        className="inline-flex h-9 items-center rounded-md bg-[#DC2626] px-3 text-sm font-medium text-white shadow disabled:opacity-50"
      >
        {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'أضف'}
      </button>
    </div>
  );
}
