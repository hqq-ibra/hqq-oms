'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useSocket } from '@/hooks/use-socket';
import { Menu, Bell } from 'lucide-react';

export interface HeaderProps {
  title: string;
  onMenuClick?: () => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const { user } = useAuth();
  const { isConnected } = useSocket();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-4 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-semibold text-[#1a1a2e]">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div
          className="flex items-center gap-2 rounded-full px-2.5 py-1"
          title={isConnected ? 'Connected' : 'Disconnected'}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              isConnected ? 'bg-[#22963A]' : 'bg-[#DC2626]'
            )}
            aria-hidden
          />
          <span className="hidden text-xs text-gray-500 sm:inline">
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#DC2626]"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#DC2626] to-[#1E3F8B] text-sm font-bold text-white shadow-sm">
          {user?.name?.charAt(0)?.toUpperCase() ??
            user?.email?.charAt(0)?.toUpperCase() ??
            '?'}
        </div>
      </div>
    </header>
  );
}
