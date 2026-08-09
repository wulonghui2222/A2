"use client";

import { useRouter } from "next/navigation";
import { ConfirmPopover } from "@/components/ConfirmPopover";

interface DeleteProjectButtonProps {
  projectId: string;
  deleteAction: (id: string) => Promise<void>;
}

export function DeleteProjectButton({ projectId, deleteAction }: DeleteProjectButtonProps) {
  const router = useRouter();

  const handleDelete = async () => {
    await deleteAction(projectId);
    router.push("/my-projects");
  };

  return (
    <ConfirmPopover
      triggerLabel="删除项目"
      triggerClassName="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
      confirmLabel="删除"
      cancelLabel="取消"
      message="确定删除此项目？此操作不可撤销。"
      onConfirm={handleDelete}
    />
  );
}
