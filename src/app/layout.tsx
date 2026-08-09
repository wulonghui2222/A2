import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { UserMenu } from "@/components/UserMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: "A2 Atoms",
  description: "AI Agent 驱动的 Web 应用生成平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <SessionProvider>
          {children}
          <UserMenu />
        </SessionProvider>
      </body>
    </html>
  );
}
