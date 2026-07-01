// Dev helper: print a valid session cookie for a given email so we can
// smoke-test authenticated pages with curl. Usage: tsx scripts/token.ts <email>
import { SignJWT } from "jose";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = (process.argv[2] ?? "boss@solidxpress.com.my").toLowerCase();
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) throw new Error("no user " + email);
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "solid-xpress-dev-secret-change-me-in-production-please-0001");
  const token = await new SignJWT({ id: u.id, email: u.email, name: u.name, role: u.role, departmentId: u.departmentId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
  console.log(token);
}
main().then(() => process.exit(0));
