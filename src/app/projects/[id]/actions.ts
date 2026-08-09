"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function deleteProjectAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== session.user.id) return;
  await prisma.project.delete({ where: { id } });
}
