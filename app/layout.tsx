import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Быки и коровы онлайн",
  description: "Играйте в Быки и коровы с друзьями из любого города."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
