import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chef",
  description: "Desktop utility toolbox rebuilt with Next.js and shadcn/ui"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
