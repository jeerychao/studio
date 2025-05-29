
import type {Metadata} from 'next';
import { Inter } from 'next/font/google'; // Changed from Geist_Sans
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Global toaster

const inter = Inter({ // Changed from Geist_Sans
  variable: '--font-inter', // Changed variable name
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
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={`${inter.variable} font-sans antialiased`}> {/* Use updated font variable */}
        {children}
        <Toaster />
      </body>
    </html>
  );
}
