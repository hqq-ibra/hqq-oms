'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  Package,
  Users,
  Box,
  Handshake,
  BarChart3,
  Shield,
  LogOut,
  Menu,
  X,
  FolderKanban,
  CheckSquare,
} from 'lucide-react';

const PERMISSIONS = {
  VIEW_REPORTS: 'VIEW_REPORTS',
  MANAGE_USERS: 'MANAGE_USERS',
} as const;

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: string;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      { href: '/customers', label: 'Customers', icon: Users },
      { href: '/products', label: 'Products', icon: Box },
      { href: '/vendors', label: 'Vendors', icon: Handshake },
      { href: '/orders', label: 'Orders', icon: Package },
    ],
  },
  {
    items: [
      { href: '/projects', label: 'Projects', icon: FolderKanban },
    ],
  },
  {
    items: [
      { href: '/todo', label: 'To-Do', icon: CheckSquare },
    ],
  },
  {
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3, permission: PERMISSIONS.VIEW_REPORTS },
      { href: '/users', label: 'Users', icon: Shield },
    ],
  },
];

function hasPermission(user: { permissions?: string[] } | null, permission?: string): boolean {
  if (!permission) return true;
  if (!user?.permissions || !Array.isArray(user.permissions)) return false;
  return user.permissions.includes(permission);
}

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  onToggle?: () => void;
}

export function Sidebar({ isOpen = false, onClose, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const filteredSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasPermission(user, item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="fixed left-4 top-4 z-40 rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-6 w-6" />
      </button>

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          'bg-[#1a1a2e] shadow-2xl',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-20 items-center justify-between px-5">
            <Link href="/orders" className="flex items-center gap-2.5">
              <Image
                src="/logo-clean.png"
                alt="HQQ"
                width={120}
                height={48}
                className="h-9 w-auto"
                priority
              />
              <span className="text-lg font-light tracking-widest text-gray-400">
                OMS
              </span>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Divider with brand gradient */}
          <div className="mx-4 h-px bg-gradient-to-r from-[#DC2626] via-[#22963A] to-[#1E3F8B]" />

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {filteredSections.map((section, sIdx) => (
              <div key={sIdx}>
                {sIdx > 0 && (
                  <div className="mx-2 my-3 h-px bg-white/10" />
                )}
                {section.label && (
                  <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                    {section.label}
                  </p>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                          isActive
                            ? 'bg-[#DC2626] text-white shadow-lg shadow-red-900/30'
                            : 'text-gray-300 hover:bg-white/8 hover:text-white'
                        )}
                      >
                        <Icon className={cn(
                          'h-5 w-5 shrink-0 transition-colors',
                          isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'
                        )} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t border-white/10 p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#DC2626] to-[#1E3F8B] text-sm font-bold text-white shadow-md">
                {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {user?.name ?? user?.email ?? 'User'}
                </p>
                <p className="truncate text-xs text-gray-400">
                  {(user?.role as string) ?? 'User'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-white/10 hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
    </>
  );
}
