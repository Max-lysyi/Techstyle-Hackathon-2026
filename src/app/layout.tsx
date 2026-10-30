import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAXSport AI Print Studio — Автоматична підготовка дизайнів для сублімації",
  description:
    "AI-платформа для декомпозиції дизайнів спортивної форми: апскейлінг, ізоляція логотипів, CMYK-мепінг кольорів та експорт розгорток лекал у TIFF/SVG для Adobe Illustrator.",
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
