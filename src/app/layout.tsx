import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HHL Credit — Reminder Calls",
  description: "AI-assisted payment reminder calling dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm">
            <a href="/" className="font-semibold">
              HHL Credit
            </a>
            <a href="/" className="text-neutral-600 hover:text-neutral-900">
              Batches
            </a>
            <a href="/callbacks" className="text-neutral-600 hover:text-neutral-900">
              Callback Tasks
            </a>
            <a href="/search" className="text-neutral-600 hover:text-neutral-900">
              Search
            </a>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
