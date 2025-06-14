
import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Removed Toaster and ThemeProvider imports for this test

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'IPAM Lite',
  description: 'Intelligent IP Address Management',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head />
      <body className="font-sans antialiased">
        {/* Removed ThemeProvider */}
        {children}
        {/* Removed Toaster */}
      </body>
    </html>
  );
}
