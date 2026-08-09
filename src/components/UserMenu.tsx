"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  if (!session?.user) {
    return (
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-white/90 backdrop-blur-sm border border-gray-200 px-3 py-2 shadow-sm">
        <Link
          href="/login"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          登录
        </Link>
        <span className="text-gray-300">|</span>
        <Link
          href="/register"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          注册
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl bg-white/90 backdrop-blur-sm border border-gray-200 px-3 py-2 shadow-sm">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
        {(session.user.name || "?").charAt(0).toUpperCase()}
      </span>
      <Link
        href="/my-projects"
        className="text-sm text-gray-700 hover:text-gray-900 transition-colors"
      >
        {session.user.name}
      </Link>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
      >
        退出
      </button>
    </div>
  );
}
