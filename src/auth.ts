import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username;
        const password = credentials?.password;
        if (!username || !password) return null;

        const user = await prisma.user.findUnique({
          where: { username: String(username) },
        });
        if (!user) return null;

        const isValid = await bcrypt.compare(String(password), user.password);
        if (!isValid) return null;

        return { id: user.id, name: user.displayName || user.username };
      },
    }),
  ],
});
