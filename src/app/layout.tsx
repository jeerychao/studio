
// Minimal font import or remove if Inter causes issues, though unlikely.
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes'; // Re-added
import { Toaster } from '@/components/ui/toaster'; // Re-added
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
