// NextAuth (Auth.js v5) route handler — serves /api/auth/* (session, csrf,
// callback, signin/signout endpoints).
import { handlers } from "@/lib/nextauth";

export const { GET, POST } = handlers;
