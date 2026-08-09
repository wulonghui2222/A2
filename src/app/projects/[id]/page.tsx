import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { PreviewFrame } from "@/components/PreviewFrame";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      sessions: {
        include: {
          messages: {
            orderBy: { timestamp: "asc" },
          },
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  // Increment view count
  await prisma.project.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });

  return (
    <PreviewFrame
      project={{
        id: project.id,
        title: project.title,
        description: project.description,
        code: project.code,
        status: project.status,
        prompt: project.prompt,
      }}
    />
  );
}
