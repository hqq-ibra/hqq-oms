import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(
  date: Date | string | number,
  formatStr = 'PPp'
): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return format(d, formatStr);
}

export function formatDateRelative(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatCurrency(
  value: number,
  currency = 'SAR',
  locale = 'ar-SA'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}
