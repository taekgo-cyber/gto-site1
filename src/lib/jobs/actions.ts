"use server";

import { prisma } from "@/lib/prisma";

export async function incrementJobPostView(jobPostId: string): Promise<number> {
  const result = await prisma.jobPost.update({
    where: { id: jobPostId },
    data: { viewCount: { increment: 1 } },
    select: { viewCount: true },
  });
  return result.viewCount;
}
