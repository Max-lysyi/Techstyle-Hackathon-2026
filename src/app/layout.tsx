import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "MAXSport AI Print Studio — Автоматична підготовка дизайнів для сублімації",
  description:
    "AI-платформа для декомпозиції дизайнів спортивної форми: апскейлінг, ізоляція логотипів, CMYK-мепінг кольорів та експорт розгорток лекал у TIFF/SVG для Adobe Illustrator.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="uk"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
