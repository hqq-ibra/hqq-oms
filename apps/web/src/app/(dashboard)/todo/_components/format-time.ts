import { differenceInMinutes, isToday, isYesterday, format } from 'date-fns';
import { ar } from 'date-fns/locale';

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = differenceInMinutes(new Date(), d);
  if (diff < 1) return 'الآن';
  if (diff < 60) return `قبل ${diff} دقيقة`;
  if (isToday(d)) return `اليوم ${format(d, 'HH:mm')}`;
  if (isYesterday(d)) return `أمس ${format(d, 'HH:mm')}`;
  const daysAgo = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (daysAgo < 7) return format(d, 'EEEE HH:mm', { locale: ar });
  return format(d, 'd MMM yyyy', { locale: ar });
}
