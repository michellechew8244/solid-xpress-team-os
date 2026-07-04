const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { hashPassword } = await import("./src/lib/passwords.ts");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const u = await prisma.user.create({ data: { email: "__ttopic-1783156613@solidxpress.test", name: "ZZ Topic Tester", passwordHash: await hashPassword("TestPass123"), role: "MANAGEMENT", accessStatus: "ACTIVE", isActive: true, mustChangePassword: false, profile: { create: {} } }, select: { id: true } });
console.log(u.id);
await prisma.$disconnect();
