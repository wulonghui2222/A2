"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/my-projects", label: "我的项目" },
  { href: "/gallery", label: "项目广场" },
];

export function Header() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
        {/* Left: brand */}
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-gray-900 shrink-0 w-20"
        >
          A2
        </Link>

        {/* Center: nav */}
        <nav className="flex-1 flex items-center justify-start gap-1">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-4 py-1.5 text-[15px] transition-colors ${
                  active
                    ? "bg-indigo-50 font-medium text-indigo-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: user area */}
        <div className="flex items-center gap-3 shrink-0">
          {status === "loading" ? (
            <div className="h-6 w-20 animate-pulse rounded-md bg-gray-100" />
          ) : session?.user ? (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                {(session.user.name || "?").charAt(0).toUpperCase()}
              </span>
              <span className="text-sm text-gray-700">
                {session.user.name}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="ml-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                退出
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                注册
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
