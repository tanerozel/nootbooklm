import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NootbookLM — Source-grounded research assistant',
  description: 'Ask questions about your documents, get cited answers.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
