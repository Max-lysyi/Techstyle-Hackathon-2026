import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Promt Studio — Розгортки чотирьох деталей",
  description:
    "Перед, спинка та два рукави: окремі прямокутні розгортки з кольоровими шарами, градієнтами та виробничою палітрою.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
