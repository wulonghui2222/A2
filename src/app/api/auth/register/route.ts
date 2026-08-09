import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username: string = (body.username || "").trim();
    const password: string = body.password || "";

    // Validate input
    if (username.length < 4 || username.length > 20) {
      return NextResponse.json(
        { error: "用户名长度需在 4-20 个字符之间", code: "INVALID_USERNAME" },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码长度至少为 6 个字符", code: "INVALID_PASSWORD" },
        { status: 400 }
      );
    }

    // Check duplicate username
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { error: "用户名已被注册", code: "DUPLICATE_USERNAME" },
        { status: 409 }
      );
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashedPassword, displayName: username },
    });

    // Auto-login after registration (sets session cookie)
    await signIn("credentials", { username, password, redirect: false });

    return NextResponse.json(
      { userId: user.id, username: user.username },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "注册失败，请稍后重试", code: "REGISTER_FAILED" },
      { status: 500 }
    );
  }
}
