import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Akunio — AI Accounting & Double-Entry Ledger",
  description:
    "Pembukuan berbasis IFRS & SAK EMKM untuk organisasi dan UKM, dengan asisten AI.",
  icons: {
    icon: "/brand/akunio-logo-mark.svg",
    apple: "/brand/akunio-logo-mark.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <body suppressHydrationWarning className="min-h-screen bg-canvas text-ink font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange enableColorScheme={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
