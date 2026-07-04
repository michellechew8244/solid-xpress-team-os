import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // If they've already changed it, don't strand them here.
  if (!user.mustChangePassword) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-950 to-brand-800 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="text-3xl">🔐</div>
          <h1 className="mt-1 text-xl font-bold text-ink">Set your own password</h1>
          <p className="text-sm text-ink-muted">For your security, please replace the temporary password before continuing, {user.name.split(" ")[0]}.</p>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
