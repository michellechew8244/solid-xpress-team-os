"use server";

import { signOut } from "@/lib/nextauth";

export async function logoutAction() {
  // signOut with redirectTo throws a redirect that propagates to the client.
  await signOut({ redirectTo: "/login" });
}
