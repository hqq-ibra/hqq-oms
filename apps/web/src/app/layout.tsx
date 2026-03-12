import type { Metadata, Viewport } from 'next';
import { Providers } from '@/providers';
import { ServiceWorkerRegister } from './sw-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'HQQ OMS',
  description: 'HQQ Order Management System',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
    ],
    shortcut: '/logo.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'HQQ OMS' },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased bg-gray-50 text-gray-900">
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
