'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { Button, Input } from '@/components/ui';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    try {
      await login(data.email, data.password);
      router.replace('/orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1a1a2e] p-4">
      {/* Background decorations */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#DC2626]/15 blur-[100px]" />
        <div className="absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-[#1E3F8B]/20 blur-[100px]" />
        <div className="absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-[#22963A]/15 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/logo-clean.png"
            alt="HQQ"
            width={200}
            height={80}
            className="mb-4 h-20 w-auto drop-shadow-2xl"
            priority
          />
          <p className="text-sm font-medium tracking-widest text-gray-400">
            ORDER MANAGEMENT SYSTEM
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="mb-6 text-center text-xl font-semibold text-white">
            Sign In
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Email
              </label>
              <input
                {...register('email')}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-gray-500 transition-colors focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Password
              </label>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-gray-500 transition-colors focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-gradient-to-r from-[#DC2626] to-[#A31818] py-3 text-sm font-semibold text-white shadow-lg shadow-red-900/40 transition-all hover:from-[#C41E1E] hover:to-[#8B1414] hover:shadow-xl hover:shadow-red-900/50 focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:ring-offset-2 focus:ring-offset-[#1a1a2e] disabled:opacity-50"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} HQQ. All rights reserved.
        </p>
      </div>
    </div>
  );
}
