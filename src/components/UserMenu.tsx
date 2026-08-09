"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  if (!session?.user) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          登录
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white
                     hover:bg-indigo-700 transition-colors"
        >
          注册
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/my-projects"
        className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        我的项目
      </Link>
      <span className="flex items-center gap-1.5 text-sm text-gray-700">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
          {(session.user.name || "?").charAt(0).toUpperCase()}
        </span>
        {session.user.name}
      </span>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        退出
      </button>
    </div>
  );
}
