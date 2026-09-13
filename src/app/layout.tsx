import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "낼래말래 운빨 미로",
  description: "누가 낼래? 피말리는 운빨 미로 서바이벌",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
