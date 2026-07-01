import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/rbac";
import { rm } from "@/lib/format";
import { Card, PageHeader, Pill, SectionTitle, StatCard } from "@/components/ui";
import { DonutChart } from "@/components/charts";

export default async function FinancePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canViewFinance(user.role)) redirect("/dashboard"); // section Q7

  const records = await prisma.financeRecord.findMany({
    include: { job: { include: { customer: true } }, },
  });
  // Salesperson names
  const salesIds = [...new Set(records.map((r) => r.salespersonId).filter(Boolean))] as string[];
  const salesUsers = await prisma.user.findMany({ where: { id: { in: salesIds } }, select: { id: true, name: true } });
  const salesName = new Map(salesUsers.map((s) => [s.id, s.name]));

  const totalInvoiced = records.filter((r) => r.invoiceIssued).reduce((s, r) => s + r.sellingPrice, 0);
  const totalCollected = records.filter((r) => r.paymentCollected).reduce((s, r) => s + r.sellingPrice, 0);
  const outstandingAR = totalInvoiced - totalCollected;
  const unbilled = records.filter((r) => !r.invoiceIssued);
  const totalGP = records.reduce((s, r) => s + r.grossProfit, 0);
  const shortBilling = records.filter((r) => r.shortBilling);
  const supplierPending = records.filter((r) => !r.supplierInvoiceChecked);

  // GP by salesperson
  const gpBySales = new Map<string, number>();
  for (const r of records) {
    if (r.salespersonId) gpBySales.set(r.salespersonId, (gpBySales.get(r.salespersonId) ?? 0) + r.grossProfit);
  }
  const gpSalesData = [...gpBySales.entries()].map(([id, v]) => ({ name: salesName.get(id) ?? "—", value: Math.round(v) }));

  return (
    <>
      <PageHeader title="Finance Control" subtitle="Billing, cost, gross profit and collection (restricted)" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Invoiced" value={rm(totalInvoiced)} icon="🧾" rag="neutral" />
        <StatCard label="Total Collected" value={rm(totalCollected)} icon="💵" rag="ok" />
        <StatCard label="Outstanding AR" value={rm(outstandingAR)} icon="⏳" rag={outstandingAR > 50000 ? "danger" : "warn"} />
        <StatCard label="Total Gross Profit" value={rm(totalGP)} icon="📈" rag="ok" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Gross Profit by Job</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                  <th className="py-2 pr-2">Job</th><th className="px-2">Customer</th><th className="px-2 text-right">Selling</th><th className="px-2 text-right">Cost</th><th className="px-2 text-right">GP</th><th className="px-2">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-2 font-medium text-brand-700">{r.job.jobNumber}</td>
                    <td className="px-2 text-ink-soft">{r.job.customer?.name ?? "—"}</td>
                    <td className="px-2 text-right">{rm(r.sellingPrice)}</td>
                    <td className="px-2 text-right text-ink-muted">{rm(r.cost)}</td>
                    <td className="px-2 text-right font-semibold text-ok">{rm(r.grossProfit)}</td>
                    <td className="px-2">
                      <div className="flex gap-1">
                        {!r.invoiceIssued && <Pill value="WARN" label="unbilled" />}
                        {r.shortBilling && <Pill value="DANGER" label="short" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle>GP by Salesperson</SectionTitle>
            {gpSalesData.length ? <DonutChart data={gpSalesData} /> : <p className="text-sm text-ink-muted">No data.</p>}
          </Card>
          <Card>
            <SectionTitle>Alerts</SectionTitle>
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between"><span>Unbilled jobs</span><span className="font-bold text-warn">{unbilled.length}</span></li>
              <li className="flex justify-between"><span>Short billing</span><span className="font-bold text-danger">{shortBilling.length}</span></li>
              <li className="flex justify-between"><span>Supplier invoice pending</span><span className="font-bold text-warn">{supplierPending.length}</span></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
