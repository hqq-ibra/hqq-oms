'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Button,
  Input,
  DataTable,
  Pagination,
  Modal,
  type DataTableColumn,
} from '@/components/ui';
import { useToast } from '@/components/ui';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const addUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Min 6 characters'),
});

const editUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
});

type AddUserValues = z.infer<typeof addUserSchema>;
type EditUserValues = z.infer<typeof editUserSchema>;

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  permissions: { permissionKey: string }[];
}

interface UsersResponse {
  data: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [page, setPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', page],
    queryFn: () =>
      api.get<UsersResponse>('/api/v1/users', {
        page: String(page),
        pageSize: '50',
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: AddUserValues) =>
      api.post('/api/v1/users', { ...payload, role: 'ADMIN' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      addToast('User created', 'success');
      setAddModalOpen(false);
      addForm.reset();
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<EditUserValues> }) =>
      api.patch(`/api/v1/users/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      addToast('User updated', 'success');
      setEditModalOpen(false);
      setEditingUser(null);
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      addToast('User deleted', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const addForm = useForm<AddUserValues>({
    resolver: zodResolver(addUserSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const editForm = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    values: editingUser
      ? { name: editingUser.name, email: editingUser.email }
      : undefined,
  });

  const users = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const columns: DataTableColumn<UserRow>[] = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setEditingUser(r);
              editForm.reset({ name: r.name, email: r.email });
              setEditModalOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete user "${r.name}"?`)) {
                deleteMutation.mutate(r.id);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <Button variant="primary" size="md" onClick={() => { addForm.reset(); setAddModalOpen(true); }}>
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={users}
        loading={isLoading}
        emptyMessage="No users yet"
      />

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Add User */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add User">
        <form onSubmit={addForm.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <Input label="Name" error={addForm.formState.errors.name?.message} {...addForm.register('name')} />
          <Input label="Email" type="email" error={addForm.formState.errors.email?.message} {...addForm.register('email')} />
          <Input label="Password" type="password" error={addForm.formState.errors.password?.message} {...addForm.register('password')} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createMutation.isPending}>Add</Button>
          </div>
        </form>
      </Modal>

      {/* Edit User */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditingUser(null); }}
        title="Edit User"
      >
        {editingUser && (
          <form
            onSubmit={editForm.handleSubmit((values) =>
              updateMutation.mutate({ id: editingUser.id, payload: values })
            )}
            className="space-y-4"
          >
            <Input label="Name" error={editForm.formState.errors.name?.message} {...editForm.register('name')} />
            <Input label="Email" type="email" error={editForm.formState.errors.email?.message} {...editForm.register('email')} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => { setEditModalOpen(false); setEditingUser(null); }}>Cancel</Button>
              <Button type="submit" variant="primary" loading={updateMutation.isPending}>Save</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
