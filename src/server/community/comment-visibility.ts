import type { Prisma } from "@prisma/client";

/** Blocking is private and mutual for comment visibility, including after signing in elsewhere. */
export async function hiddenCommentAuthors(
  tx: Pick<Prisma.TransactionClient, "userBlock">,
  userId: string,
) {
  const blocks = await tx.userBlock.findMany({
    where: { OR: [{ ownerId: userId }, { blockedUserId: userId }] },
    select: { ownerId: true, blockedUserId: true },
  });
  return blocks.map((block) => (block.ownerId === userId ? block.blockedUserId : block.ownerId));
}
