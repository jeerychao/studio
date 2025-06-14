// Minimal font import or remove if Inter causes issues, though unlikely.
import { Inter } from 'next/font/google';
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata = { // Simplified metadata
  title: 'IPAM Lite Minimal Test',
  description: 'Testing basic page rendering.',
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
        {children}
      </body>
    </html>
  );
}
