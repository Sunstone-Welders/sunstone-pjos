import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { Toaster } from 'sonner';
import NativeBoot from '@/components/NativeBoot';
import NativeSessionSync from '@/components/NativeSessionSync';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sunstone Studio',
  description: 'The all-in-one platform for permanent jewelry artists and booth-based businesses.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#FFFBF7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NativeBoot />
        <Suspense fallback={null}>
          <NativeSessionSync />
        </Suspense>
        {children}
        <Analytics />
        <Toaster
          position="top-right"
          theme="light"
          toastOptions={{
            style: {
              background: 'var(--surface-overlay)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            },
          }}
        />
      </body>
    </html>
  );
}