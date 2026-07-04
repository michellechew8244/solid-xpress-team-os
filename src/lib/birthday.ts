import { prisma } from "./prisma";
import { klNow } from "./attendance";
import { notifyMany } from "./notify";

const BOT_EMAIL = "birthday-bot@solidxpress.system";

/** The system account that posts automatic birthday announcements. */
export async function getBirthdayBot() {
  const existing = await prisma.user.findUnique({ where: { email: BOT_EMAIL }, select: { id: true, name: true, avatarColor: true, avatarUrl: true } });
  if (existing) return existing;
  return prisma.user.create({
    data: { email: BOT_EMAIL, name: "🎂 Solid Xpress", passwordHash: "disabled-no-login", role: "STAFF", accessStatus: "INACTIVE", isActive: false, avatarColor: "#db2777" },
    select: { id: true, name: true, avatarColor: true, avatarUrl: true },
  });
}

/** Set of active-staff user ids whose birthday is today (KL month-day match). */
export async function todaysBirthdayIds(): Promise<Set<string>> {
  const mmdd = klNow().dateStr.slice(5);
  const users = await prisma.user.findMany({ where: { isActive: true, dateOfBirth: { not: null } }, select: { id: true, dateOfBirth: true } });
  return new Set(users.filter((u) => u.dateOfBirth && u.dateOfBirth.toISOString().slice(5, 10) === mmdd).map((u) => u.id));
}

/** Idempotently post a morning birthday announcement to the Staff Forum (once/day). */
export async function ensureBirthdayForumPost(people: { id: string; name: string }[]) {
  if (people.length === 0) return;
  const { dateStr } = klNow();
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const bot = await getBirthdayBot();
  const already = await prisma.forumMessage.findFirst({ where: { userId: bot.id, createdAt: { gte: dayStart } } });
  if (already) return; // already posted today

  const names = people.map((p) => p.name.split(" ")[0]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const body = `🎂🎉 Happy Birthday to ${list}! 🥳\n\nWishing you a fantastic day from the whole Solid Xpress family. Drop your birthday wishes below! 🎈🎁`;
  await prisma.forumMessage.create({ data: { userId: bot.id, body } });
  await notifyMany(prisma, people.map((p) => p.id), { type: "ANNOUNCEMENT", title: "🎂 Happy Birthday from the team!", body: "The team is celebrating you on the Staff Forum today. 🎉", link: "/forum" });
}
