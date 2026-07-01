import bcrypt from "bcryptjs";

/** Password hashing helpers, kept separate so both NextAuth and app code can
 *  use them without importing the session layer (avoids circular imports). */

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
