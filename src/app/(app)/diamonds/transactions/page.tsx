import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { Avatar, Card, PageHeader, SectionTitle } from "@/components/ui";
import { getDiamondTransactions, DIAMOND_SOURCE_TYPES, DIAMOND_TXN_TYPES, type TxnFilter } from "@/lib/diamonds";
import { RowActions, ExportButton } from "@/components/diamonds/TransactionControls";

export default async function DiamondTransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const owner = isBoss(user.role);
  const sp = await searchParams;

  const filter: TxnFilter = {
    staffId: sp.staff || undefined,
    departmentId: sp.dept || undefined,
    transactionType: sp.type || undefined,
    sourceType: sp.source || undefined,
    status: sp.status || undefined,
    from: sp.from ? new Date(sp.from) : undefined,
    to: sp.to ? new Date(sp.to) : undefined,
    take: 200,
  };

  const [txns, departments, staff] = await Promise.all([
    getDiamondTransactions(filter, { id: user.id, role: user.role, departmentId: user.departmentId }),
    owner || user.role === "HR_ADMIN" ? prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    owner || user.role === "HR_ADMIN" ? prisma.user.findMany({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Diamond Transactions"
        subtitle={owner ? "All diamond activity across the company." : user.role === "STAFF" ? "Your diamond transaction history." : "Diamond activity you can view."}
        action={<ExportButton filter={filter} />}
      />

      {/* Filters */}
      <Card className="mb-4">
        <form className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" method="get">
          {(owner || user.role === "HR_ADMIN") && (
            <>
              <select name="staff" defaultValue={sp.staff ?? ""} className="input text-sm"><option value="">All staff</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <select name="dept" defaultValue={sp.dept ?? ""} className="input text-sm"><option value="">All depts</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </>
          )}
          <select name="type" defaultValue={sp.type ?? ""} className="input text-sm"><option value="">All types</option>{Object.entries(DIAMOND_TXN_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="source" defaultValue={sp.source ?? ""} className="input text-sm"><option value="">All sources</option>{Object.entries(DIAMOND_SOURCE_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="status" defaultValue={sp.status ?? ""} className="input text-sm"><option value="">All status</option>{["COMPLETED", "APPROVED", "PENDING", "REVERSED", "VOIDED", "REJECTED"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <input name="from" type="date" defaultValue={sp.from ?? ""} className="input text-sm" />
          <input name="to" type="date" defaultValue={sp.to ?? ""} className="input text-sm" />
          <button className="btn-primary px-3 py-1 text-sm">Filter</button>
        </form>
      </Card>

      <Card className="p-0">
        <div className="p-4 pb-1"><SectionTitle>History ({txns.length})</SectionTitle></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Source</th><th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Before</th><th className="px-3 py-2 text-right">After</th>
                <th className="px-3 py-2">Reason</th><th className="px-3 py-2">Status</th>{owner && <th className="px-3 py-2">Action</th>}
              </tr>
            </thead>
            <tbody>
              {txns.length === 0 && <tr><td colSpan={owner ? 10 : 9} className="px-3 py-6 text-center text-ink-muted">No transactions.</td></tr>}
              {txns.map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-muted">{dateTime(t.createdAt)}</td>
                  <td className="px-3 py-2"><div className="flex items-center gap-2"><Avatar name={t.user.name} color={t.user.avatarColor} size={22} /><span className="truncate">{t.user.name}</span></div><div className="text-[10px] text-ink-muted">{t.user.department?.name ?? ""}</div></td>
                  <td className="px-3 py-2 text-xs">{t.transactionType ? DIAMOND_TXN_TYPES[t.transactionType] ?? t.transactionType : t.type}</td>
                  <td className="px-3 py-2 text-xs">{t.sourceType ? DIAMOND_SOURCE_TYPES[t.sourceType] ?? t.sourceType : "—"}</td>
                  <td className={`px-3 py-2 text-right font-bold ${t.amount >= 0 ? "text-ok" : "text-danger"}`}>{t.amount >= 0 ? "+" : ""}{t.amount}</td>
                  <td className="px-3 py-2 text-right text-xs text-ink-muted">{t.balanceBefore ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-xs text-ink-muted">{t.balanceAfter ?? "—"}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-xs" title={t.reason}>{t.reason}</td>
                  <td className="px-3 py-2 text-xs">{t.status}</td>
                  {owner && <td className="px-3 py-2"><RowActions txId={t.id} status={t.status} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
