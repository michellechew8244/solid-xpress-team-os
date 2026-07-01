import { prisma } from "./prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * In-app notifications (section K). Future phases can fan these out to
 * WhatsApp / email by listening to this single creation point.
 */
export async function notify(
  db: Db,
  args: { userId: string; type: string; title: string; body?: string; link?: string },
) {
  await db.notification.create({
    data: {
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      link: args.link,
    },
  });
}

export async function notifyMany(
  db: Db,
  userIds: string[],
  args: { type: string; title: string; body?: string; link?: string },
) {
  await Promise.all(userIds.map((userId) => notify(db, { userId, ...args })));
}
