'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { TaskRow } from './task-row';
import type { TodoTask } from '../_types';

export function DoneSection({
  tasks,
  ownerUserId,
}: {
  tasks: TodoTask[];
  ownerUserId: string;
}) {
  const [open, setOpen] = React.useState(false);
  if (tasks.length === 0) return null;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md py-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        تم ({tasks.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} ownerUserId={ownerUserId} sortable={false} />
          ))}
        </ul>
      )}
    </div>
  );
}
