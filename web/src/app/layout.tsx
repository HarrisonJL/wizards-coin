import type { Metadata } from "next";
import { Geist_Mono, Press_Start_2P, VT323 } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

const pixelFont = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
});

const terminalFont = VT323({
  variable: "--font-vt323",
  weight: "400",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Wizard's Coin",
  description: "A prize vault guarded by a GenLayer validator jury, not one operator's AI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${pixelFont.variable} ${terminalFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-[color:var(--foreground)]">
        <div className="crt-overlay" />
        <Navbar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
        <footer className="border-t-2 border-[color:var(--panel-light)] px-4 py-4 text-center text-sm text-slate-400 sm:px-6">
          GENLAYER TESTNET ONLY &middot; NO REAL MONEY &middot; JUDGED BY A VALIDATOR JURY, NOT BY US
        </footer>
      </body>
    </html>
  );
}
