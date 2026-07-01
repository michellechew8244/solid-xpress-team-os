import { prisma } from "./prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Record a sensitive management action in the audit log (section: Audit Log).
 * oldValue/newValue are JSON-stringified snapshots for diffing.
 */
export async function logAudit(
  db: Db,
  args: {
    action: string;
    entityId: string;
    entityType?: string;
    performedBy: string;
    actorName?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ipAddress?: string;
  },
) {
  await db.auditLog.create({
    data: {
      action: args.action,
      entityType: args.entityType ?? "USER",
      entityId: args.entityId,
      performedBy: args.performedBy,
      actorName: args.actorName,
      oldValue: args.oldValue !== undefined ? JSON.stringify(args.oldValue) : null,
      newValue: args.newValue !== undefined ? JSON.stringify(args.newValue) : null,
      ipAddress: args.ipAddress,
    },
  });
}
