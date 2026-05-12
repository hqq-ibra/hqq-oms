'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Loader2, X } from 'lucide-react';
import type { TodoPerson } from '../_types';

export function AddPersonDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (body: { name: string; email?: string }) =>
      api.post<TodoPerson>('/api/v1/todo/people', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todo-people'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    const n = name.trim();
    if (!n) {
      setError('الاسم مطلوب');
      return;
    }
    const body: { name: string; email?: string } = { name: n };
    const e = email.trim();
    if (e) body.email = e;
    mut.mutate(body);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">إضافة شخص</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block text-sm font-medium text-gray-700">الاسم *</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          className="mt-1 mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-red-200"
          placeholder="مثلاً: محمد علي"
          dir="auto"
        />

        <label className="block text-sm font-medium text-gray-700">الإيميل (اختياري)</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          className="mt-1 mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-red-200"
          placeholder="example@hqq.com"
          dir="ltr"
        />

        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={mut.isPending || !name.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-[#DC2626] px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
          >
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            إضافة
          </button>
        </div>
      </form>
    </div>
  );
}
