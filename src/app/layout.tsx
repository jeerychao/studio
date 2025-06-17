
// Minimal font import or remove if Inter causes issues, though unlikely.
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers'; // Updated import
import "./globals.css"; // Assuming this was intended to be imported here originally for global styles

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata = {
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
        <Providers
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
