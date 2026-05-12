export type TodoPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface TodoPerson {
  id: string;
  name: string;
  email: string | null;
  activeTaskCount: number;
}

export interface TodoNote {
  id: string;
  taskId: string;
  content: string;
  createdAt: string;
  createdByUserId: string | null;
  createdBy: { id: string; name: string } | null;
}

export interface TodoTask {
  id: string;
  ownerPersonId: string;
  title: string;
  priority: TodoPriority;
  orderIndex: number;
  isDone: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: TodoNote[];
  _count: { notes: number };
}

export interface TodoTasksResponse {
  owner: { id: string; name: string; email: string | null };
  active: TodoTask[];
  done: TodoTask[];
}

export const PRIORITY_LABEL: Record<TodoPriority, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const PRIORITY_COLOR: Record<TodoPriority, { bg: string; text: string; ring: string }> = {
  HIGH:   { bg: 'bg-red-500',    text: 'text-white', ring: 'ring-red-600' },
  MEDIUM: { bg: 'bg-amber-500',  text: 'text-white', ring: 'ring-amber-600' },
  LOW:    { bg: 'bg-emerald-600',text: 'text-white', ring: 'ring-emerald-700' },
};
