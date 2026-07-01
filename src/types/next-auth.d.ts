import type { DefaultSession } from "next-auth";

// Augment NextAuth types with our RBAC fields.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      departmentId: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    role?: string;
    departmentId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    departmentId?: string | null;
  }
}
