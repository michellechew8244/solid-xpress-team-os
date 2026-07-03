import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SignupForm } from "@/components/SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const departments = await prisma.department.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-950 to-brand-800 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="text-3xl">📦</div>
          <h1 className="mt-1 text-xl font-bold text-ink">Join Solid Xpress Team OS</h1>
          <p className="text-sm text-ink-muted">Fill in your details — management will approve your account before you can log in.</p>
        </div>
        <SignupForm departments={departments} />
        <p className="mt-4 text-center text-sm text-ink-muted">
          Already have an account? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
