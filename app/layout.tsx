import type { Metadata } from "next";

import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Быки и коровы онлайн",
  description: "Играйте в Быки и коровы с друзьями из любого города.",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
