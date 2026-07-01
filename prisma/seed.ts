/**
 * Seed Solid Xpress Team OS with realistic sample data.
 * Run: npm run db:seed   (or npm run db:reset to wipe + reseed)
 *
 * Default password for EVERY seeded account: "password123"
 * Key logins are printed at the end of the seed.
 */
import bcrypt from "bcryptjs";
import { MILESTONES, currentPeriod, levelForLifetime, UNIVERSAL_PENALTIES, LEAVE_BLOCK_SETTINGS, CAMPAIGN_TEMPLATES } from "../src/lib/enums";
// Reuse the adapter-backed client (Prisma 7 is engine-less and requires an adapter).
import { prisma } from "../src/lib/prisma";
const PASSWORD = "password123";
const PERIOD = currentPeriod();

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function main() {
  console.log("🧹 Clearing existing data...");
  // Delete in dependency order.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.userLevelMission.deleteMany(),
    prisma.levelMission.deleteMany(),
    prisma.levelUpgradeRequest.deleteMany(),
    prisma.levelHistory.deleteMany(),
    prisma.levelRule.deleteMany(),
    prisma.luckyDrawEntry.deleteMany(),
    prisma.luckyDrawPrize.deleteMany(),
    prisma.luckyDrawCampaign.deleteMany(),
    prisma.systemSetting.deleteMany(),
    prisma.penaltyRule.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.taskComment.deleteMany(),
    prisma.taskChecklist.deleteMany(),
    prisma.task.deleteMany(),
    prisma.kPIResult.deleteMany(),
    prisma.kPI.deleteMany(),
    prisma.jobMilestone.deleteMany(),
    prisma.financeRecord.deleteMany(),
    prisma.job.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.pointsTransaction.deleteMany(),
    prisma.rewardRedemption.deleteMany(),
    prisma.reward.deleteMany(),
    prisma.userBadge.deleteMany(),
    prisma.badge.deleteMany(),
    prisma.dailyReport.deleteMany(),
    prisma.coachingRecord.deleteMany(),
    prisma.performanceReview.deleteMany(),
    prisma.trainingCompletion.deleteMany(),
    prisma.training.deleteMany(),
    prisma.staffProfile.deleteMany(),
  ]);
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  const hash = await bcrypt.hash(PASSWORD, 10);

  // ---- Departments -------------------------------------------------------
  console.log("🏢 Departments...");
  const deptDefs = [
    { code: "MGMT", name: "Management", rev: 0, gp: 0 },
    { code: "MKT", name: "Marketing", rev: 0, gp: 0 },
    { code: "SALES", name: "Sales", rev: 600000, gp: 180000 },
    { code: "CS", name: "Customer Service", rev: 0, gp: 0 },
    { code: "OPS", name: "Operation", rev: 0, gp: 0 },
    { code: "FWD", name: "Forwarding / Declaration", rev: 0, gp: 0 },
    { code: "HAUL", name: "Haulage / Transport", rev: 120000, gp: 40000 },
    { code: "RUN", name: "Runner", rev: 0, gp: 0 },
    { code: "DISP", name: "Dispatch", rev: 0, gp: 0 },
    { code: "FIN", name: "Finance / Account", rev: 0, gp: 0 },
    { code: "HR", name: "HR / Admin", rev: 0, gp: 0 },
  ];
  const depts: Record<string, { id: string }> = {};
  for (const d of deptDefs) {
    const created = await prisma.department.create({
      data: {
        code: d.code,
        name: d.name,
        revenueTarget: d.rev,
        grossProfitTarget: d.gp,
      },
    });
    depts[d.code] = created;
  }

  // ---- Users -------------------------------------------------------------
  console.log("👥 Users...");
  const colors = ["#1b45d6", "#0891b2", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#dc2626"];
  let colorIdx = 0;
  const nextColor = () => pick(colors, colorIdx++);
  const empTypes = ["FULL_TIME", "FULL_TIME", "FULL_TIME", "CONTRACT", "PART_TIME", "INTERN"];
  let codeSeq = 0;

  async function makeUser(opts: {
    email: string;
    name: string;
    role: string;
    deptCode?: string;
    jobTitle?: string;
    managerEmail?: string;
    growth?: number;
    status?: string;
  }) {
    const manager = opts.managerEmail
      ? await prisma.user.findUnique({ where: { email: opts.managerEmail } })
      : null;
    codeSeq += 1;
    const phone = "+60 1" + Math.floor(Math.random() * 900000000 + 100000000);
    const u = await prisma.user.create({
      data: {
        email: opts.email.toLowerCase(),
        employeeCode: "SX-" + String(codeSeq).padStart(4, "0"),
        passwordHash: hash,
        name: opts.name,
        role: opts.role,
        jobTitle: opts.jobTitle,
        phoneNumber: phone,
        employmentStatus: opts.status ?? (opts.role === "STAFF" ? pick(["ACTIVE", "CONFIRMED", "PROBATION"], codeSeq) : "CONFIRMED"),
        employmentType: pick(empTypes, codeSeq),
        accessStatus: "ACTIVE",
        isActive: true,
        departmentId: opts.deptCode ? depts[opts.deptCode].id : null,
        managerId: manager?.id,
        avatarColor: nextColor(),
        growthLevel: opts.growth ?? 1,
        joinDate: daysFromNow(-Math.floor(Math.random() * 700) - 90),
        profile: {
          create: {
            phone: "+60 1" + Math.floor(Math.random() * 900000000 + 100000000),
            daysPresent: 18 + Math.floor(Math.random() * 4),
            daysLate: Math.floor(Math.random() * 3),
            daysAbsent: Math.floor(Math.random() * 2),
            onboardingProgress: 100,
          },
        },
      },
    });
    return u;
  }

  // Boss + management
  const boss = await makeUser({
    email: "boss@solidxpress.com.my",
    name: "Tan Sri Lim (Boss)",
    role: "SUPER_ADMIN",
    deptCode: "MGMT",
    jobTitle: "Managing Director",
    growth: 7,
  });
  await makeUser({
    email: "gm@solidxpress.com.my",
    name: "Wong Mei Ling",
    role: "MANAGEMENT",
    deptCode: "MGMT",
    jobTitle: "General Manager",
    managerEmail: boss.email,
    growth: 6,
  });
  await makeUser({
    email: "hr@solidxpress.com.my",
    name: "Nurul Aisyah",
    role: "HR_ADMIN",
    deptCode: "HR",
    jobTitle: "HR & Admin Manager",
    managerEmail: boss.email,
    growth: 5,
  });
  await makeUser({
    email: "finance@solidxpress.com.my",
    name: "Kavitha Raj",
    role: "FINANCE_ADMIN",
    deptCode: "FIN",
    jobTitle: "Finance Manager",
    managerEmail: boss.email,
    growth: 5,
  });

  // Department heads
  const heads: Record<string, string> = {
    SALES: "sales.head@solidxpress.com.my",
    CS: "cs.head@solidxpress.com.my",
    OPS: "ops.head@solidxpress.com.my",
    FWD: "fwd.head@solidxpress.com.my",
    HAUL: "haul.head@solidxpress.com.my",
    MKT: "mkt.head@solidxpress.com.my",
  };
  const headNames: Record<string, string> = {
    SALES: "Daniel Chong",
    CS: "Siti Rahmah",
    OPS: "Ravi Kumar",
    FWD: "Lee Chee Keong",
    HAUL: "Hafiz Rahman",
    MKT: "Jasmine Yeo",
  };
  for (const code of Object.keys(heads)) {
    const head = await makeUser({
      email: heads[code],
      name: headNames[code],
      role: "DEPARTMENT_HEAD",
      deptCode: code,
      jobTitle: `${deptDefs.find((d) => d.code === code)!.name} Head`,
      managerEmail: "gm@solidxpress.com.my",
      growth: 4 + (Math.random() > 0.5 ? 1 : 0),
    });
    await prisma.department.update({ where: { id: depts[code].id }, data: { headId: head.id } });
  }

  // Staff
  const staffDefs = [
    { email: "ahmad@solidxpress.com.my", name: "Ahmad Faizal", dept: "SALES", title: "Sales Executive" },
    { email: "michelle@solidxpress.com.my", name: "Michelle Tan", dept: "SALES", title: "Sales Executive" },
    { email: "priya@solidxpress.com.my", name: "Priya Sharma", dept: "CS", title: "Customer Service Officer" },
    { email: "jason@solidxpress.com.my", name: "Jason Lim", dept: "CS", title: "Customer Service Officer" },
    { email: "farah@solidxpress.com.my", name: "Farah Nadia", dept: "OPS", title: "Operations Coordinator" },
    { email: "kenny@solidxpress.com.my", name: "Kenny Goh", dept: "OPS", title: "Operations Coordinator" },
    { email: "syafiq@solidxpress.com.my", name: "Syafiq Aziz", dept: "FWD", title: "Declaration Officer" },
    { email: "meena@solidxpress.com.my", name: "Meena Devi", dept: "FWD", title: "Forwarding Clerk" },
    { email: "rosli@solidxpress.com.my", name: "Rosli Hamid", dept: "HAUL", title: "Transport Coordinator" },
    { email: "azman@solidxpress.com.my", name: "Azman Ismail", dept: "RUN", title: "Runner", manager: "ops.head@solidxpress.com.my" },
    { email: "vimal@solidxpress.com.my", name: "Vimal Raj", dept: "RUN", title: "Runner", manager: "ops.head@solidxpress.com.my" },
    { email: "chong@solidxpress.com.my", name: "Chong Wei", dept: "DISP", title: "Dispatch Rider", manager: "ops.head@solidxpress.com.my" },
    { email: "lina@solidxpress.com.my", name: "Lina Hassan", dept: "FIN", title: "Account Assistant", manager: "finance@solidxpress.com.my" },
    { email: "amir@solidxpress.com.my", name: "Amir Hakim", dept: "MKT", title: "Content Executive" },
  ];
  const managerForDept: Record<string, string> = {
    SALES: "sales.head@solidxpress.com.my",
    CS: "cs.head@solidxpress.com.my",
    OPS: "ops.head@solidxpress.com.my",
    FWD: "fwd.head@solidxpress.com.my",
    HAUL: "haul.head@solidxpress.com.my",
    MKT: "mkt.head@solidxpress.com.my",
  };
  const staff: Record<string, { id: string; name: string; departmentId: string | null }> = {};
  for (const s of staffDefs) {
    const u = await makeUser({
      email: s.email,
      name: s.name,
      role: "STAFF",
      deptCode: s.dept,
      jobTitle: s.title,
      managerEmail: s.manager ?? managerForDept[s.dept],
      growth: 1 + Math.floor(Math.random() * 3),
    });
    staff[s.email] = u;
  }

  const allStaffEmails = staffDefs.map((s) => s.email);

  // ---- KPIs --------------------------------------------------------------
  console.log("📊 KPIs...");
  const kpiByDept: Record<string, { name: string; target: number; freq: string; pts: number; pen: number; evidence?: boolean }[]> = {
    MKT: [
      { name: "Content posts published", target: 20, freq: "MONTHLY", pts: 15, pen: 5, evidence: true },
      { name: "Leads generated", target: 60, freq: "MONTHLY", pts: 25, pen: 0 },
      { name: "Website enquiry count", target: 40, freq: "MONTHLY", pts: 15, pen: 0 },
      { name: "Content consistency score", target: 90, freq: "WEEKLY", pts: 10, pen: 5 },
    ],
    SALES: [
      { name: "New leads contacted", target: 80, freq: "MONTHLY", pts: 20, pen: 0 },
      { name: "Quotations sent", target: 50, freq: "MONTHLY", pts: 15, pen: 0 },
      { name: "New customers won", target: 6, freq: "MONTHLY", pts: 40, pen: 0 },
      { name: "Gross profit generated (RM)", target: 90000, freq: "MONTHLY", pts: 50, pen: 0 },
      { name: "Lost deal reason updated", target: 100, freq: "WEEKLY", pts: 10, pen: 10 },
    ],
    CS: [
      { name: "Enquiry response time (≤2h %)", target: 95, freq: "DAILY", pts: 15, pen: 10 },
      { name: "Shipment status updated on time", target: 98, freq: "DAILY", pts: 15, pen: 10, evidence: true },
      { name: "Complaints solved", target: 100, freq: "WEEKLY", pts: 20, pen: 0 },
      { name: "Customer satisfaction score", target: 90, freq: "MONTHLY", pts: 25, pen: 0 },
    ],
    OPS: [
      { name: "Jobs created correctly", target: 98, freq: "DAILY", pts: 15, pen: 10 },
      { name: "Shipment milestone updated", target: 95, freq: "DAILY", pts: 15, pen: 10 },
      { name: "No missed closing/arrival date", target: 100, freq: "WEEKLY", pts: 25, pen: 20 },
      { name: "No demurrage from ops mistake", target: 100, freq: "MONTHLY", pts: 30, pen: 30 },
    ],
    FWD: [
      { name: "Permit submitted on time", target: 98, freq: "DAILY", pts: 20, pen: 15, evidence: true },
      { name: "Declaration accuracy (K-forms)", target: 99, freq: "WEEKLY", pts: 25, pen: 20 },
      { name: "HS code checking completed", target: 100, freq: "DAILY", pts: 15, pen: 10 },
      { name: "No penalty from declaration error", target: 100, freq: "MONTHLY", pts: 35, pen: 40 },
    ],
    HAUL: [
      { name: "Truck arrangement on time", target: 96, freq: "DAILY", pts: 15, pen: 10 },
      { name: "Container delivery completed", target: 98, freq: "DAILY", pts: 15, pen: 10 },
      { name: "No failed delivery", target: 100, freq: "WEEKLY", pts: 25, pen: 20 },
      { name: "No waiting charge (internal)", target: 100, freq: "MONTHLY", pts: 25, pen: 25 },
    ],
    RUN: [
      { name: "Document collection completed", target: 98, freq: "DAILY", pts: 15, pen: 10, evidence: true },
      { name: "Original BL/DO collected", target: 100, freq: "DAILY", pts: 20, pen: 15 },
      { name: "Proof uploaded", target: 100, freq: "DAILY", pts: 10, pen: 10, evidence: true },
      { name: "Task completed within deadline", target: 95, freq: "WEEKLY", pts: 15, pen: 10 },
    ],
    DISP: [
      { name: "Documents delivered on time", target: 97, freq: "DAILY", pts: 15, pen: 10, evidence: true },
      { name: "Delivery proof uploaded", target: 100, freq: "DAILY", pts: 10, pen: 10, evidence: true },
      { name: "Urgent delivery completed", target: 100, freq: "WEEKLY", pts: 20, pen: 0 },
    ],
    FIN: [
      { name: "Invoice issued within target time", target: 95, freq: "DAILY", pts: 20, pen: 15 },
      { name: "Customer payment followed up", target: 100, freq: "WEEKLY", pts: 15, pen: 10 },
      { name: "No short billing", target: 100, freq: "MONTHLY", pts: 30, pen: 30 },
      { name: "Monthly closing completed", target: 100, freq: "MONTHLY", pts: 35, pen: 0 },
    ],
  };

  const createdKpis: { id: string; deptCode: string; pts: number; target: number }[] = [];
  for (const code of Object.keys(kpiByDept)) {
    const head = await prisma.user.findUnique({ where: { email: heads[code] ?? managerForDept[code] ?? "gm@solidxpress.com.my" } });
    for (const k of kpiByDept[code]) {
      const kpi = await prisma.kPI.create({
        data: {
          name: k.name,
          departmentId: depts[code].id,
          weightage: 1,
          targetValue: k.target,
          frequency: k.freq,
          pointReward: k.pts,
          penaltyPoint: k.pen,
          evidenceRequired: !!k.evidence,
          dataSource: "Manual entry / system",
          ownerId: head?.id,
          reviewerId: head?.id,
          formula: "actual / target × 100",
        },
      });
      createdKpis.push({ id: kpi.id, deptCode: code, pts: k.pts, target: k.target });
    }
  }

  // KPI results for staff in this period
  console.log("📈 KPI results...");
  for (const email of allStaffEmails) {
    const u = staff[email];
    const deptKpis = createdKpis.filter((k) => {
      const sd = staffDefs.find((s) => s.email === email)!.dept;
      return k.deptCode === sd;
    });
    for (const k of deptKpis) {
      const achievementPct = 55 + Math.floor(Math.random() * 55); // 55..110
      const capped = Math.min(achievementPct, 100);
      const actual = +(k.target * (achievementPct / 100)).toFixed(1);
      await prisma.kPIResult.create({
        data: {
          kpiId: k.id,
          userId: u.id,
          period: PERIOD,
          actualValue: actual,
          achievementPct: capped,
          pointsAwarded: Math.round((k.pts * capped) / 100),
          status: "REVIEWED",
        },
      });
    }
  }

  // ---- Customers ---------------------------------------------------------
  console.log("📦 Customers & jobs...");
  const customerNames = [
    "Pantech Steel Sdn Bhd",
    "Greenfield Agro Trading",
    "Maxtron Electronics",
    "Sinar Plastik Industries",
    "OceanFresh Seafood Export",
    "BuildPro Hardware",
    "Astra Pharma Logistics",
  ];
  const customers: { id: string; name: string }[] = [];
  for (let i = 0; i < customerNames.length; i++) {
    const c = await prisma.customer.create({
      data: {
        name: customerNames[i],
        code: "CUST" + String(i + 1).padStart(3, "0"),
        contact: "Mr/Ms Procurement",
        email: `purchasing${i + 1}@example.com`,
        phone: "+60 3-" + (7000000 + i),
        atRisk: i === 4, // OceanFresh flagged at risk
      },
    });
    customers.push(c);
  }

  // ---- Jobs + milestones + finance --------------------------------------
  const modes = ["SEA", "AIR", "LAND", "FORWARDING", "HAULAGE"];
  const ports = [
    ["Port Klang, MY", "Shanghai, CN"],
    ["Penang, MY", "Singapore, SG"],
    ["Pasir Gudang, MY", "Rotterdam, NL"],
    ["KLIA, MY", "Hong Kong, HK"],
    ["Port Klang, MY", "Jakarta, ID"],
  ];
  const opsStaff = [staff["farah@solidxpress.com.my"], staff["kenny@solidxpress.com.my"]];
  const csStaff = [staff["priya@solidxpress.com.my"], staff["jason@solidxpress.com.my"]];
  const fwdStaff = [staff["syafiq@solidxpress.com.my"], staff["meena@solidxpress.com.my"]];
  const runners = [staff["azman@solidxpress.com.my"], staff["vimal@solidxpress.com.my"]];
  const salesStaff = [staff["ahmad@solidxpress.com.my"], staff["michelle@solidxpress.com.my"]];

  const jobs: { id: string; jobNumber: string }[] = [];
  for (let i = 0; i < 10; i++) {
    const mode = pick(modes, i);
    const route = pick(ports, i);
    const direction = i % 2 === 0 ? "IMPORT" : "EXPORT";
    const milestonesDone = 3 + (i % 8); // varied progress
    const billed = i % 3 === 0;
    const collected = i % 4 === 0;

    const job = await prisma.job.create({
      data: {
        jobNumber: `SX-${PERIOD.replace("-", "")}-${String(i + 1).padStart(3, "0")}`,
        direction,
        mode,
        customerId: pick(customers, i).id,
        consignee: direction === "IMPORT" ? "Local Consignee Sdn Bhd" : pick(customerNames, i + 1),
        shipper: direction === "IMPORT" ? "Overseas Shipper Ltd" : pick(customerNames, i),
        pol: route[0],
        pod: route[1],
        vesselName: mode === "SEA" ? pick(["MV Bunga Mas", "MV Kota Nila", "MV Cosco Star"], i) : null,
        voyage: mode === "SEA" ? "V" + (100 + i) : null,
        flightDetails: mode === "AIR" ? "MH" + (600 + i) : null,
        etd: daysFromNow(-10 + i),
        eta: daysFromNow(5 + i),
        closingDate: daysFromNow(-12 + i),
        arrivalDate: daysFromNow(5 + i),
        containerNumber: mode === "SEA" ? `TCLU${1000000 + i}` : null,
        quantity: pick(["1x20GP", "2x40HQ", "1x40GP", "500 ctn"], i),
        goodsDescription: pick(["Steel coils", "Agro produce", "Electronic parts", "Plastic resin", "Frozen seafood"], i),
        serviceRequired: "Freight + Customs + Haulage",
        permitRequired: i % 2 === 0,
        customsFormType: pick(["K1", "K2", "K3", "K8", "ZB"], i),
        assignedCsId: pick(csStaff, i).id,
        assignedOpsId: pick(opsStaff, i).id,
        assignedFwdId: pick(fwdStaff, i).id,
        assignedRunnerId: pick(runners, i).id,
        assignedFinanceId: staff["lina@solidxpress.com.my"].id,
        status: milestonesDone >= MILESTONES.length ? "CLOSED" : "IN_PROGRESS",
        billingStatus: billed ? "BILLED" : "UNBILLED",
        collectionStatus: collected ? "COLLECTED" : "PENDING",
      },
    });
    jobs.push(job);

    // milestones
    for (let m = 0; m < MILESTONES.length; m++) {
      await prisma.jobMilestone.create({
        data: {
          jobId: job.id,
          stage: MILESTONES[m].stage,
          label: MILESTONES[m].label,
          order: m,
          done: m < milestonesDone,
          doneAt: m < milestonesDone ? daysFromNow(-milestonesDone + m) : null,
        },
      });
    }

    // finance record
    const selling = 8000 + Math.floor(Math.random() * 30000);
    const cost = Math.floor(selling * (0.6 + Math.random() * 0.2));
    await prisma.financeRecord.create({
      data: {
        jobId: job.id,
        sellingPrice: selling,
        cost,
        grossProfit: selling - cost,
        invoiceIssued: billed,
        invoiceDate: billed ? daysFromNow(-3) : null,
        supplierInvoiceChecked: i % 2 === 0,
        paymentCollected: collected,
        disbursementClaimed: i % 3 === 0,
        shortBilling: i === 6,
        salespersonId: pick(salesStaff, i).id,
      },
    });
  }

  // ---- Tasks -------------------------------------------------------------
  console.log("✅ Tasks / Mission Board...");
  const taskDefs = [
    { title: "Follow up quotation with Pantech Steel", dept: "SALES", assignee: "ahmad@solidxpress.com.my", type: "SALES_FOLLOWUP", prio: "HIGH", days: 1, status: "IN_PROGRESS" },
    { title: "Send daily shipment update to Maxtron", dept: "CS", assignee: "priya@solidxpress.com.my", type: "DAILY", prio: "MEDIUM", days: 0, status: "NOT_STARTED" },
    { title: "Submit K1 declaration for SX job 003", dept: "FWD", assignee: "syafiq@solidxpress.com.my", type: "PERMIT_FOLLOWUP", prio: "URGENT", days: -1, status: "IN_PROGRESS" },
    { title: "Arrange haulage pickup Port Klang", dept: "HAUL", assignee: "rosli@solidxpress.com.my", type: "HAULAGE_FOLLOWUP", prio: "HIGH", days: 1, status: "WAITING_EXTERNAL" },
    { title: "Collect original BL from shipping line", dept: "RUN", assignee: "azman@solidxpress.com.my", type: "RUNNER_TASK", prio: "HIGH", days: 0, status: "COMPLETED", proof: "BL scan uploaded" },
    { title: "Issue invoice for closed jobs", dept: "FIN", assignee: "lina@solidxpress.com.my", type: "FINANCE_ISSUE", prio: "MEDIUM", days: 2, status: "NOT_STARTED" },
    { title: "Publish weekly logistics tips post", dept: "MKT", assignee: "amir@solidxpress.com.my", type: "WEEKLY", prio: "LOW", days: 3, status: "IN_PROGRESS" },
    { title: "Update milestone for delayed vessel", dept: "OPS", assignee: "farah@solidxpress.com.my", type: "SHIPMENT_ISSUE", prio: "HIGH", days: -2, status: "IN_PROGRESS" },
    { title: "Resolve OceanFresh complaint on late DO", dept: "CS", assignee: "jason@solidxpress.com.my", type: "CUSTOMER_ISSUE", prio: "URGENT", days: -1, status: "IN_PROGRESS" },
    { title: "Deliver permit documents to authority", dept: "DISP", assignee: "chong@solidxpress.com.my", type: "RUNNER_TASK", prio: "MEDIUM", days: 0, status: "COMPLETED", proof: "Signed receipt photo" },
    { title: "Prepare month-end GP report", dept: "FIN", assignee: "lina@solidxpress.com.my", type: "FINANCE_ISSUE", prio: "HIGH", days: 4, status: "NOT_STARTED" },
    { title: "Cold call 10 new manufacturing leads", dept: "SALES", assignee: "michelle@solidxpress.com.my", type: "SALES_FOLLOWUP", prio: "MEDIUM", days: 1, status: "IN_PROGRESS" },
  ];

  for (let i = 0; i < taskDefs.length; i++) {
    const t = taskDefs[i];
    const assignee = staff[t.assignee];
    const reviewerEmail = managerForDept[t.dept] ?? heads[t.dept] ?? "gm@solidxpress.com.my";
    const reviewer = await prisma.user.findUnique({ where: { email: reviewerEmail } });
    const deadline = daysFromNow(t.days);
    const overdue = deadline.getTime() < Date.now() && t.status !== "COMPLETED";

    const task = await prisma.task.create({
      data: {
        title: t.title,
        description: "Auto-seeded mission for demo purposes.",
        departmentId: depts[t.dept].id,
        assigneeId: assignee.id,
        reviewerId: reviewer?.id,
        createdById: reviewer?.id,
        type: t.type,
        priority: t.prio,
        status: overdue ? "OVERDUE" : t.status,
        deadline,
        completedAt: t.status === "COMPLETED" ? daysFromNow(-1) : null,
        approvedAt: t.status === "COMPLETED" ? daysFromNow(-1) : null,
        pointsAwarded: t.status === "COMPLETED",
        pointsValue: 10 + (i % 3) * 5,
        proofUrl: t.proof ?? null,
        customerId: pick(customers, i).id,
        jobId: pick(jobs, i).id,
        checklist: {
          create: [
            { label: "Review job details", order: 0, done: t.status !== "NOT_STARTED" },
            { label: "Take required action", order: 1, done: t.status === "COMPLETED" },
            { label: "Upload proof", order: 2, done: !!t.proof },
          ],
        },
        comments: {
          create:
            i % 3 === 0
              ? [{ authorId: reviewer!.id, body: "Please prioritise this today.", }]
              : [],
        },
      },
    });

    // award points for completed approved tasks
    if (t.status === "COMPLETED") {
      await prisma.pointsTransaction.create({
        data: {
          userId: assignee.id,
          amount: task.pointsValue,
          type: "TASK",
          reason: `Task approved: ${t.title}`,
          refType: "TASK",
          refId: task.id,
          period: PERIOD,
        },
      });
    }
  }

  // ---- Points (spread across staff) + recompute wallets ------------------
  console.log("💎 Points & wallets...");
  const earnTypes = [
    ["TASK", "Completed task on time"],
    ["KPI", "KPI achievement"],
    ["COMPLIMENT", "Customer compliment received"],
    ["TEAMWORK", "Helped another department"],
    ["SALES", "Closed a new deal"],
    ["COST_SAVING", "Reduced freight cost"],
    ["ZERO_MISTAKE", "Zero mistake this week"],
  ];
  for (const email of allStaffEmails) {
    const u = staff[email];
    const n = 4 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const [type, reason] = pick(earnTypes, i + email.length);
      await prisma.pointsTransaction.create({
        data: {
          userId: u.id,
          amount: 10 + Math.floor(Math.random() * 50),
          type,
          reason,
          period: PERIOD,
          createdAt: daysFromNow(-Math.floor(Math.random() * 20)),
        },
      });
    }
    // occasional penalty
    if (Math.random() > 0.6) {
      await prisma.pointsTransaction.create({
        data: {
          userId: u.id,
          amount: -(5 + Math.floor(Math.random() * 15)),
          type: "PENALTY",
          reason: pick(["Late task submission", "Missing status update", "Proof not uploaded"], email.length),
          period: PERIOD,
          createdAt: daysFromNow(-Math.floor(Math.random() * 15)),
        },
      });
    }
  }

  // recompute wallets for everyone
  const everyone = await prisma.user.findMany();
  for (const u of everyone) {
    const txns = await prisma.pointsTransaction.findMany({ where: { userId: u.id } });
    let current = 0, lifetime = 0, deducted = 0, redeemed = 0, monthlyEarned = 0, monthlyDeducted = 0;
    for (const t of txns) {
      current += t.amount;
      if (t.amount > 0) lifetime += t.amount;
      if (t.type === "PENALTY" && t.amount < 0) deducted += Math.abs(t.amount);
      if (t.type === "REDEMPTION" && t.amount < 0) redeemed += Math.abs(t.amount);
      if (t.period === PERIOD) {
        if (t.amount > 0) monthlyEarned += t.amount;
        else if (t.type === "PENALTY") monthlyDeducted += Math.abs(t.amount);
      }
    }
    await prisma.user.update({
      where: { id: u.id },
      data: { currentPoints: current, lifetimePoints: lifetime, deductedPoints: deducted, redeemedPoints: redeemed, monthlyEarned, monthlyDeducted, growthLevel: levelForLifetime(lifetime) },
    });
  }

  // ---- Rewards -----------------------------------------------------------
  console.log("🎁 Rewards...");
  // MVP reward store — Solid Xpress reward spec §8 (15 rewards).
  const rewards = [
    { name: "Free Coffee / Milk Tea", category: "MEAL_VOUCHER", cost: 150, emoji: "☕", desc: "Daily motivation pick-me-up." },
    { name: "Snack Box", category: "MEAL_VOUCHER", cost: 150, emoji: "🍫", desc: "A treat to keep you going." },
    { name: "Lunch Treat", category: "MEAL_VOUCHER", cost: 300, emoji: "🍱", desc: "Lunch is on the company." },
    { name: "RM30 Cash Voucher", category: "CASH_VOUCHER", cost: 300, emoji: "💵", desc: "RM30 voucher (HR approval)." },
    { name: "RM50 Cash Voucher", category: "CASH_VOUCHER", cost: 500, emoji: "💵", desc: "RM50 voucher (HR approval)." },
    { name: "Petrol Voucher RM50", category: "COMPANY_GIFT", cost: 500, emoji: "⛽", desc: "RM50 fuel allowance." },
    { name: "Movie Ticket Pair", category: "COMPANY_GIFT", cost: 800, emoji: "🎬", desc: "Two cinema tickets." },
    { name: "RM100 Cash Voucher", category: "CASH_VOUCHER", cost: 900, emoji: "💵", desc: "RM100 voucher (HR approval)." },
    { name: "Grocery Voucher RM100", category: "CASH_VOUCHER", cost: 1000, emoji: "🛒", desc: "RM100 grocery voucher." },
    { name: "Solid Xpress Tumbler", category: "COMPANY_GIFT", cost: 400, emoji: "🥤", desc: "Branded tumbler — wear the pride." },
    { name: "Solid Xpress Hoodie", category: "COMPANY_GIFT", cost: 800, emoji: "🧥", desc: "Premium branded hoodie." },
    { name: "Lucky Draw Ticket", category: "LUCKY_DRAW", cost: 300, emoji: "🎟️", desc: "One extra lucky-draw entry." },
    { name: "Half-Day Leave", category: "EXTRA_LEAVE", cost: 1500, emoji: "🌴", desc: "Half-day off (no overdue task)." },
    { name: "Logistics Training Subsidy", category: "TRAINING", cost: 2000, emoji: "🎓", desc: "RM200–RM500 course sponsorship." },
    { name: "One-Day Extra Leave", category: "EXTRA_LEAVE", cost: 3000, emoji: "🏖️", desc: "Full day off (grade A+, boss approval)." },
  ];
  const createdRewards: Record<string, { id: string }> = {};
  for (const r of rewards) {
    createdRewards[r.name] = await prisma.reward.create({
      data: { name: r.name, category: r.category, pointsCost: r.cost, imageEmoji: r.emoji, description: r.desc },
    });
  }
  // a couple of sample redemptions
  await prisma.rewardRedemption.create({
    data: { rewardId: createdRewards["Lucky Draw Ticket"].id, userId: staff["azman@solidxpress.com.my"].id, pointsSpent: 300, status: "PENDING" },
  });
  await prisma.rewardRedemption.create({
    data: { rewardId: createdRewards["Lunch Treat"].id, userId: staff["priya@solidxpress.com.my"].id, pointsSpent: 300, status: "APPROVED", decidedAt: daysFromNow(-2) },
  });

  // ---- Badges ------------------------------------------------------------
  console.log("🏅 Badges...");
  // Full badge catalogue — Solid Xpress reward spec §4A (universal) + §4B (per department).
  const badgeDefs = [
    // Universal
    { name: "Zero Mistake", desc: "No error for one month.", criteria: "0 errors in a month", icon: "🎯", bonus: 200 },
    { name: "Speed Master", desc: "95% tasks completed on time.", criteria: "≥95% on-time tasks", icon: "⚡", bonus: 150 },
    { name: "Team Player", desc: "Help other departments 5 times/month.", criteria: "5 cross-dept helps", icon: "🤝", bonus: 150 },
    { name: "Problem Solver", desc: "Solve urgent issue with proof.", criteria: "Urgent case solved", icon: "🧩", bonus: 150 },
    { name: "Customer Hero", desc: "Receive a customer compliment.", criteria: "Customer compliment", icon: "🦸", bonus: 200 },
    { name: "SOP Builder", desc: "Create approved SOP improvement.", criteria: "Approved SOP improvement", icon: "📐", bonus: 200 },
    { name: "Mentor", desc: "Train junior staff successfully.", criteria: "Mentored a new joiner", icon: "🧑‍🏫", bonus: 200 },
    { name: "Solid Warrior", desc: "Handle a high-pressure month with grade A.", criteria: "Grade A in a peak month", icon: "💪", bonus: 250 },
    { name: "Growth Mindset", desc: "Complete training and pass quiz.", criteria: "Training passed", icon: "🌱", bonus: 100 },
    { name: "Ownership", desc: "Take initiative beyond job scope.", criteria: "Initiative beyond scope", icon: "🦅", bonus: 150 },
    // Marketing
    { name: "Content Machine", desc: "Publish monthly content target.", criteria: "Content target met", icon: "📝", bonus: 150, dept: "MKT" },
    { name: "Lead Generator", desc: "Generate the highest valid leads.", criteria: "Top valid leads", icon: "🧲", bonus: 200, dept: "MKT" },
    { name: "Brand Builder", desc: "Create high-performing content.", criteria: "High-performing content", icon: "🎨", bonus: 200, dept: "MKT" },
    { name: "Campaign Hero", desc: "Campaign produces sales enquiry.", criteria: "Campaign → enquiry", icon: "📣", bonus: 250, dept: "MKT" },
    // Sales
    { name: "Sales Hunter", desc: "Highest new customers won.", criteria: "Top new-customer wins", icon: "🏹", bonus: 250, dept: "SALES" },
    { name: "GP Champion", desc: "Highest GP achievement.", criteria: "Top GP", icon: "💰", bonus: 300, dept: "SALES" },
    { name: "Follow-Up King/Queen", desc: "100% follow-up completion.", criteria: "100% follow-up", icon: "👑", bonus: 150, dept: "SALES" },
    { name: "Referral Master", desc: "Close a customer referral.", criteria: "Referral closed", icon: "🔗", bonus: 200, dept: "SALES" },
    // Customer Service
    { name: "Customer Angel", desc: "Customer compliment received.", criteria: "Compliment received", icon: "😇", bonus: 200, dept: "CS" },
    { name: "Update Master", desc: "100% shipment update completion.", criteria: "100% updates", icon: "🔔", bonus: 150, dept: "CS" },
    { name: "Complaint Solver", desc: "Resolve a difficult complaint.", criteria: "Tough complaint solved", icon: "🧯", bonus: 250, dept: "CS" },
    { name: "Handover Champion", desc: "Zero handover mistakes.", criteria: "0 handover errors", icon: "📋", bonus: 200, dept: "CS" },
    // Operation
    { name: "Shipment Controller", desc: "Zero missed closing / ETA monitoring.", criteria: "0 missed dates", icon: "🎛️", bonus: 250, dept: "OPS" },
    { name: "Booking Master", desc: "Booking completed within target.", criteria: "On-target bookings", icon: "📑", bonus: 150, dept: "OPS" },
    { name: "Crisis Handler", desc: "Solve an urgent operation case.", criteria: "Urgent ops solved", icon: "🚨", bonus: 250, dept: "OPS" },
    { name: "Milestone Master", desc: "100% milestone update.", criteria: "100% milestones", icon: "🚩", bonus: 150, dept: "OPS" },
    // Forwarding / Declaration
    { name: "Permit Expert", desc: "Complex permit solved.", criteria: "Complex permit solved", icon: "📜", bonus: 250, dept: "FWD" },
    { name: "Customs Accuracy", desc: "Zero declaration mistakes.", criteria: "0 declaration errors", icon: "✅", bonus: 300, dept: "FWD" },
    { name: "HS Code Guardian", desc: "Correct HS code risk identified.", criteria: "HS risk caught", icon: "🔢", bonus: 250, dept: "FWD" },
    { name: "Duty Protector", desc: "Prevent a duty/tax mistake.", criteria: "Duty mistake prevented", icon: "🛃", bonus: 300, dept: "FWD" },
    // Haulage / Transport
    { name: "Haulage Controller", desc: "Zero failed delivery.", criteria: "0 failed deliveries", icon: "🚛", bonus: 250, dept: "HAUL" },
    { name: "Truck Master", desc: "Urgent truck arranged successfully.", criteria: "Urgent truck arranged", icon: "🚚", bonus: 200, dept: "HAUL" },
    { name: "POD Champion", desc: "100% POD uploaded.", criteria: "100% POD", icon: "📸", bonus: 150, dept: "HAUL" },
    { name: "Waiting Charge Saver", desc: "Prevent waiting/storage charge.", criteria: "Charge prevented", icon: "⏱️", bonus: 250, dept: "HAUL" },
    // Runner
    { name: "Document Warrior", desc: "Zero document loss.", criteria: "0 documents lost", icon: "📂", bonus: 250, dept: "RUN" },
    { name: "Urgent Runner", desc: "Complete urgent task on time.", criteria: "Urgent task on time", icon: "🏃", bonus: 150, dept: "RUN" },
    { name: "Proof Master", desc: "100% proof uploaded.", criteria: "100% proof", icon: "📎", bonus: 150, dept: "RUN" },
    { name: "Port Runner Hero", desc: "Solve a port document issue.", criteria: "Port issue solved", icon: "⚓", bonus: 200, dept: "RUN" },
    // Dispatch
    { name: "Delivery Hero", desc: "Zero wrong delivery.", criteria: "0 wrong deliveries", icon: "📦", bonus: 200, dept: "DISP" },
    { name: "POD Master", desc: "100% POD uploaded.", criteria: "100% POD", icon: "📷", bonus: 150, dept: "DISP" },
    { name: "Urgent Dispatch", desc: "Complete urgent delivery.", criteria: "Urgent delivery done", icon: "🛵", bonus: 150, dept: "DISP" },
    { name: "Safe Document Badge", desc: "Zero missing document.", criteria: "0 missing docs", icon: "🔐", bonus: 250, dept: "DISP" },
    // Finance
    { name: "Finance Guardian", desc: "Zero short billing.", criteria: "0 short billing", icon: "🛡️", bonus: 300, dept: "FIN" },
    { name: "Collection Hero", desc: "Recover overdue payment.", criteria: "Overdue recovered", icon: "💵", bonus: 250, dept: "FIN" },
    { name: "Cost Accuracy Badge", desc: "Zero cost entry mistake.", criteria: "0 cost errors", icon: "🧮", bonus: 200, dept: "FIN" },
    { name: "Billing Speed Badge", desc: "100% invoice within deadline.", criteria: "100% on-time invoices", icon: "🧾", bonus: 200, dept: "FIN" },
    // HR / Admin
    { name: "Culture Builder", desc: "Complete staff engagement activity.", criteria: "Engagement activity done", icon: "🎉", bonus: 200, dept: "HR" },
    { name: "Onboarding Master", desc: "New staff onboarding completed.", criteria: "Onboarding completed", icon: "🚀", bonus: 200, dept: "HR" },
    { name: "Training Builder", desc: "Complete a training plan.", criteria: "Training plan done", icon: "📚", bonus: 200, dept: "HR" },
    { name: "People Guardian", desc: "Staff record and discipline updated.", criteria: "Records up to date", icon: "🧑‍🤝‍🧑", bonus: 150, dept: "HR" },
  ];
  const createdBadges: Record<string, { id: string }> = {};
  for (const b of badgeDefs) {
    createdBadges[b.name] = await prisma.badge.create({
      data: {
        name: b.name,
        description: b.desc,
        criteria: b.criteria,
        icon: b.icon,
        pointsBonus: b.bonus,
        departmentEligibility: b.dept ?? "ALL",
        autoAward: false,
      },
    });
  }
  // award a few
  await prisma.userBadge.create({ data: { userId: staff["azman@solidxpress.com.my"].id, badgeId: createdBadges["Speed Master"].id } });
  await prisma.userBadge.create({ data: { userId: staff["ahmad@solidxpress.com.my"].id, badgeId: createdBadges["Sales Hunter"].id } });
  await prisma.userBadge.create({ data: { userId: staff["priya@solidxpress.com.my"].id, badgeId: createdBadges["Customer Hero"].id } });
  await prisma.userBadge.create({ data: { userId: staff["syafiq@solidxpress.com.my"].id, badgeId: createdBadges["Permit Expert"].id } });

  // ---- Growth Roadmap: level rules + missions -----------------------------
  console.log("🪜 Growth Roadmap level rules...");
  const levelRules = [
    { levelNumber: 1, levelName: "New Learner", description: "Default level for every new joiner.", minLifetimePoints: 0, minBadgeCount: 0, requiredGrade: null, requiredConsecutiveGradeMonths: 1, requiredZeroMistake: false, requiredTeamworkCount: 0, requiredSpecialContributionCount: 0, requiredBadgeNames: null, requiresManagerApproval: false, requiresHRApproval: false, requiresBossApproval: false, bonusPoints: 0, rewardDescription: "Access to basic KPI dashboard\nCan earn points and badges" },
    { levelNumber: 2, levelName: "Reliable Executor", description: "Consistently completes daily work without chasing.", minLifetimePoints: 1000, minBadgeCount: 2, requiredGrade: "B", requiredConsecutiveGradeMonths: 1, requiredZeroMistake: true, requiredTeamworkCount: 0, requiredSpecialContributionCount: 0, requiredBadgeNames: null, requiresManagerApproval: false, requiresHRApproval: false, requiresBossApproval: false, bonusPoints: 100, rewardDescription: "Unlock RM50 voucher redemption\nUnlock Speed Master pathway\nEligible for monthly mini lucky draw" },
    { levelNumber: 3, levelName: "Problem Solver", description: "Solves issues, not just tasks.", minLifetimePoints: 3000, minBadgeCount: 4, requiredGrade: "B", requiredConsecutiveGradeMonths: 1, requiredZeroMistake: true, requiredTeamworkCount: 0, requiredSpecialContributionCount: 1, requiredBadgeNames: "Problem Solver,Customer Hero,Team Player", requiresManagerApproval: false, requiresHRApproval: false, requiresBossApproval: false, bonusPoints: 200, rewardDescription: "Unlock Problem Solver badge mission\nEligible for special contribution bonus\nCan be nominated for Most Improved Staff" },
    { levelNumber: 4, levelName: "Department Champion", description: "A top performer within their department.", minLifetimePoints: 6000, minBadgeCount: 6, requiredGrade: "A", requiredConsecutiveGradeMonths: 1, requiredZeroMistake: false, requiredTeamworkCount: 0, requiredSpecialContributionCount: 0, requiredBadgeNames: "Zero Mistake", requiresManagerApproval: true, requiresHRApproval: false, requiresBossApproval: false, bonusPoints: 300, rewardDescription: "Eligible for Department Champion recognition\nUnlock premium badge display\nEligible for quarterly lucky draw" },
    { levelNumber: 5, levelName: "Team Leader Potential", description: "Ready to guide others, not just deliver.", minLifetimePoints: 10000, minBadgeCount: 8, requiredGrade: "A", requiredConsecutiveGradeMonths: 2, requiredZeroMistake: false, requiredTeamworkCount: 5, requiredSpecialContributionCount: 0, requiredBadgeNames: "Mentor,SOP Builder", requiresManagerApproval: false, requiresHRApproval: true, requiresBossApproval: false, bonusPoints: 500, rewardDescription: "Eligible for mentor badge\nEligible for leadership training subsidy\nCan be nominated for team lead development" },
    { levelNumber: 6, levelName: "Business Builder", description: "Improves how Solid Xpress works, not just their own output.", minLifetimePoints: 15000, minBadgeCount: 10, requiredGrade: "A", requiredConsecutiveGradeMonths: 3, requiredZeroMistake: false, requiredTeamworkCount: 0, requiredSpecialContributionCount: 1, requiredBadgeNames: null, requiresManagerApproval: false, requiresHRApproval: false, requiresBossApproval: true, bonusPoints: 800, rewardDescription: "Eligible for strategy project mission\nEligible for high-value reward catalogue\nCan mentor junior staff officially" },
    { levelNumber: 7, levelName: "Solid Xpress Elite", description: "The company's top-tier, all-round performer.", minLifetimePoints: 25000, minBadgeCount: 15, requiredGrade: "A", requiredConsecutiveGradeMonths: 3, requiredZeroMistake: true, requiredTeamworkCount: 0, requiredSpecialContributionCount: 0, requiredBadgeNames: null, requiresManagerApproval: false, requiresHRApproval: false, requiresBossApproval: true, bonusPoints: 1200, rewardDescription: "Elite recognition badge\nAnnual award nomination\nPremium reward eligibility\nBoss recognition feature" },
  ];
  for (const r of levelRules) await prisma.levelRule.create({ data: r });

  console.log("🧭 Growth Roadmap missions...");
  const levelMissions = [
    { title: "Complete 5 tasks on time this week", description: "Finish 5 tasks before their deadline within the current week.", levelTarget: 2, pointsReward: 50, difficulty: "EASY", missionType: "AUTO_TASKS_ON_TIME", targetValue: 5 },
    { title: "Earn the Speed Master badge", description: "Get 95% of your tasks completed on time in a month.", levelTarget: 2, pointsReward: 100, difficulty: "NORMAL", missionType: "AUTO_BADGE", targetValue: 1, badge: "Speed Master" },
    { title: "Submit daily report for 5 working days", description: "Submit your daily report 5 days in a row.", levelTarget: 2, pointsReward: 50, difficulty: "EASY", missionType: "AUTO_DAILY_REPORTS", targetValue: 5 },
    { title: "Achieve Grade B or above this month", description: "Hit a monthly performance grade of B or better.", levelTarget: 2, pointsReward: 100, difficulty: "NORMAL", missionType: "AUTO_GRADE", targetValue: 1 },
    { title: "Help another department once this week", description: "Assist a colleague outside your department and get it recognised.", levelTarget: 3, pointsReward: 80, difficulty: "EASY", missionType: "MANUAL", targetValue: 1 },
    { title: "Solve one urgent issue with proof", description: "Resolve an urgent case and upload proof for your manager to verify.", levelTarget: 3, pointsReward: 150, difficulty: "CHALLENGE", missionType: "MANUAL", targetValue: 1 },
    { title: "Earn the Zero Mistake badge", description: "Go a full month with zero recorded mistakes.", levelTarget: 4, pointsReward: 200, difficulty: "CHALLENGE", missionType: "AUTO_BADGE", targetValue: 1, badge: "Zero Mistake" },
    { title: "Reach Top 3 in your department", description: "Climb into the top 3 of your department's leaderboard.", levelTarget: 4, pointsReward: 250, difficulty: "CHALLENGE", missionType: "MANUAL", targetValue: 1 },
    { title: "Train one junior staff", description: "Mentor a newer team member through a real task or process.", levelTarget: 5, pointsReward: 200, difficulty: "CHALLENGE", missionType: "MANUAL", targetValue: 1 },
    { title: "Create one approved SOP improvement", description: "Propose a process improvement that gets approved by your manager.", levelTarget: 5, pointsReward: 250, difficulty: "CHALLENGE", missionType: "MANUAL", targetValue: 1 },
    { title: "Complete one cost-saving improvement", description: "Identify and deliver a change that saves the company real cost.", levelTarget: 6, pointsReward: 300, difficulty: "ADVANCED", missionType: "MANUAL", targetValue: 1 },
    { title: "Become a quarterly champion candidate", description: "Get nominated for the Quarterly Champion Draw through strong, consistent performance.", levelTarget: 7, pointsReward: 500, difficulty: "ADVANCED", missionType: "MANUAL", targetValue: 1 },
  ];
  for (const m of levelMissions) {
    const { badge, ...rest } = m as typeof m & { badge?: string };
    await prisma.levelMission.create({ data: { ...rest, badgeRewardId: badge ? createdBadges[badge]?.id ?? null : null } });
  }

  // Demo flavor: give one strong performer a completed Lv.2 upgrade + history entry.
  await prisma.user.update({ where: { id: staff["azman@solidxpress.com.my"].id }, data: { officialLevel: 2 } });
  await prisma.levelHistory.create({
    data: { userId: staff["azman@solidxpress.com.my"].id, fromLevel: 1, toLevel: 2, reason: "Reached Lv.2 requirements (demo seed)", bonusPointsAwarded: 100 },
  });

  // ---- Daily reports -----------------------------------------------------
  console.log("📝 Daily reports...");
  for (const email of allStaffEmails.slice(0, 9)) {
    const u = staff[email];
    await prisma.dailyReport.create({
      data: {
        userId: u.id,
        completed: "Handled assigned shipments and customer updates.",
        pending: "Awaiting permit approval from authority.",
        needHelp: Math.random() > 0.6 ? "Need ops to confirm container availability." : null,
        customerFocus: pick(customerNames, email.length),
        priorities: "1. Clear overdue tasks\n2. Update milestones\n3. Follow up payment",
        energyLevel: 3 + Math.floor(Math.random() * 3),
        confidenceLevel: 3 + Math.floor(Math.random() * 3),
        date: new Date(),
      },
    });
  }

  // ---- Coaching ----------------------------------------------------------
  console.log("🎓 Coaching & reviews...");
  const salesHead = await prisma.user.findUnique({ where: { email: heads.SALES } });
  await prisma.coachingRecord.create({
    data: {
      staffId: staff["michelle@solidxpress.com.my"].id,
      coachId: salesHead!.id,
      category: "KPI_MISSED",
      issue: "Quotation follow-up rate below target this month.",
      coachingNote: "Block 1 hour daily for structured follow-up calls.",
      improvementAction: "Reach 50 quotations and 6 follow-ups/day for next 2 weeks.",
      deadline: daysFromNow(14),
      followUpDate: daysFromNow(14),
      status: "OPEN",
    },
  });

  // ---- Performance reviews ----------------------------------------------
  for (const email of allStaffEmails.slice(0, 6)) {
    const u = staff[email];
    const sd = staffDefs.find((s) => s.email === email)!;
    const manager = await prisma.user.findUnique({ where: { email: managerForDept[sd.dept] ?? "gm@solidxpress.com.my" } });
    const kpiScore = 60 + Math.floor(Math.random() * 38);
    const taskScore = 60 + Math.floor(Math.random() * 35);
    const accuracyScore = 70 + Math.floor(Math.random() * 30);
    const teamworkScore = 70 + Math.floor(Math.random() * 30);
    const disciplineScore = 70 + Math.floor(Math.random() * 30);
    const totalScore = Math.round(kpiScore * 0.5 + taskScore * 0.2 + accuracyScore * 0.15 + teamworkScore * 0.1 + disciplineScore * 0.05);
    const grade = totalScore >= 95 ? "A_PLUS" : totalScore >= 90 ? "A" : totalScore >= 80 ? "B" : totalScore >= 70 ? "C" : totalScore >= 60 ? "D" : "E";
    await prisma.performanceReview.create({
      data: {
        staffId: u.id,
        managerId: manager?.id,
        period: PERIOD,
        kpiScore,
        taskScore,
        accuracyScore,
        teamworkScore,
        disciplineScore,
        totalScore,
        pointScore: Math.min(100, u.id.length * 3 + 50),
        attendanceScore: 85 + Math.floor(Math.random() * 15),
        customerScore: 70 + Math.floor(Math.random() * 30),
        managerRating: 70 + Math.floor(Math.random() * 30),
        finalGrade: grade,
        rewardRecommendation: totalScore >= 85 ? "Eligible for reward & lucky draw entry" : "—",
        promotionRecommendation: grade === "A" || grade === "A_PLUS" ? "Consider for promotion next quarter" : "—",
        improvementPlan: totalScore < 70 ? "Focus on KPI follow-up consistency." : "Maintain momentum.",
      },
    });
  }

  // ---- Training ----------------------------------------------------------
  console.log("📚 Training...");
  const trainings = [
    { title: "Customs Declaration Basics (K-Forms)", dept: "FWD", pts: 30 },
    { title: "Customer Service Excellence", dept: "CS", pts: 20 },
    { title: "Sales Closing Techniques", dept: "SALES", pts: 25 },
    { title: "Solid Xpress SOP & Job Flow", dept: "ALL", pts: 20 },
  ];
  const createdTrainings = [];
  for (const t of trainings) {
    createdTrainings.push(
      await prisma.training.create({
        data: {
          title: t.title,
          departmentEligibility: t.dept,
          description: "Required onboarding & upskilling module.",
          videoLink: "https://example.com/training-video",
          sopDocument: "https://example.com/sop.pdf",
          passingMark: 70,
          pointsAward: t.pts,
        },
      }),
    );
  }
  await prisma.trainingCompletion.create({
    data: { trainingId: createdTrainings[3].id, userId: staff["amir@solidxpress.com.my"].id, score: 85, passed: true, status: "PASSED", completedAt: daysFromNow(-5) },
  });
  await prisma.trainingCompletion.create({
    data: { trainingId: createdTrainings[0].id, userId: staff["syafiq@solidxpress.com.my"].id, score: 92, passed: true, status: "PASSED", completedAt: daysFromNow(-10) },
  });

  // ---- Penalty rules -----------------------------------------------------
  console.log("⚖️  Penalty rules...");
  for (const p of UNIVERSAL_PENALTIES) {
    await prisma.penaltyRule.create({
      data: {
        name: p.name,
        deductionPoints: p.deduction,
        severity: p.severity,
        coachingTrigger: !!p.coaching,
        isRedLine: !!p.redLine,
        requiresManagerApproval: p.severity === "CRITICAL",
        description: "Universal Solid Xpress deduction rule (internal-cause only).",
      },
    });
  }

  // ---- Lucky Draw --------------------------------------------------------
  console.log("🎰 Lucky draw...");
  const campaign = await prisma.luckyDrawCampaign.create({
    data: {
      title: `${PERIOD} Monthly Performance Lucky Draw`,
      campaignType: "MONTHLY_MINI",
      description: "Top performers earn entries automatically. Extra entries can be bought with points.",
      entryRule: "Grade A+=5 · A=3 · B=1 · Zero mistake=3 · Compliment=3 · Zero overdue=1 · Badge=1",
      pointsPerEntry: 300,
      drawDate: daysFromNow(20),
      status: "ACTIVE",
    },
  });
  await prisma.luckyDrawPrize.createMany({
    data: [
      { campaignId: campaign.id, prizeName: "RM500 Cash Prize", prizeValue: 500, quantity: 1, order: 0 },
      { campaignId: campaign.id, prizeName: "Smart Watch", prizeValue: 350, quantity: 1, order: 1 },
      { campaignId: campaign.id, prizeName: "RM100 Grab Voucher", prizeValue: 100, quantity: 1, order: 2 },
      { campaignId: campaign.id, prizeName: "Mystery Gift Box", prizeValue: 80, quantity: 1, order: 3 },
    ],
  });
  // Seed entries from performance signals.
  const entrySources: { email: string; count: number; source: string }[] = [
    { email: "azman@solidxpress.com.my", count: 3, source: "ZERO_OVERDUE" },
    { email: "ahmad@solidxpress.com.my", count: 2, source: "KPI_SCORE" },
    { email: "priya@solidxpress.com.my", count: 2, source: "COMPLIMENT" },
    { email: "syafiq@solidxpress.com.my", count: 2, source: "BADGE" },
    { email: "farah@solidxpress.com.my", count: 1, source: "ZERO_MISTAKE" },
    { email: "michelle@solidxpress.com.my", count: 1, source: "TEAMWORK" },
    { email: "kenny@solidxpress.com.my", count: 1, source: "KPI_SCORE" },
    { email: "meena@solidxpress.com.my", count: 1, source: "COMPLIMENT" },
  ];
  for (const e of entrySources) {
    await prisma.luckyDrawEntry.create({
      data: { campaignId: campaign.id, userId: staff[e.email].id, entryCount: e.count, sourceType: e.source },
    });
  }
  // A second campaign created from the Quarterly Champion template.
  const qTpl = CAMPAIGN_TEMPLATES.find((t) => t.type === "QUARTERLY_CHAMPION")!;
  const qCampaign = await prisma.luckyDrawCampaign.create({
    data: { title: `Q3 ${qTpl.title}`, campaignType: qTpl.type, description: qTpl.description, entryRule: qTpl.entryRule, pointsPerEntry: qTpl.pointsPerEntry, status: "ACTIVE", drawDate: daysFromNow(60) },
  });
  await prisma.luckyDrawPrize.createMany({
    data: qTpl.prizes.map((p, i) => ({ campaignId: qCampaign.id, prizeName: p.prizeName, prizeValue: p.prizeValue, quantity: p.quantity, order: i })),
  });

  // ---- System settings (leave-block toggles, default off) ----------------
  for (const s of LEAVE_BLOCK_SETTINGS) {
    await prisma.systemSetting.create({ data: { key: s.key, label: s.label, enabled: false } });
  }

  // ---- Notifications -----------------------------------------------------
  console.log("🔔 Notifications...");
  for (const email of allStaffEmails.slice(0, 8)) {
    const u = staff[email];
    await prisma.notification.create({
      data: { userId: u.id, type: "TASK_ASSIGNED", title: "New task assigned", body: "You have a new mission on the board.", link: "/missions" },
    });
    await prisma.notification.create({
      data: { userId: u.id, type: "POINTS_AWARDED", title: "Points awarded 🎉", body: "You earned points for completing a task.", link: "/wallet" },
    });
  }
  await prisma.notification.create({
    data: { userId: boss.id, type: "CUSTOMER_COMPLAINT", title: "Customer complaint logged", body: "OceanFresh reported a late DO.", link: "/dashboard" },
  });

  console.log("\n✅ Seed complete!\n");
  console.log("Login accounts (password: password123):");
  console.log("  Boss/Super Admin : boss@solidxpress.com.my");
  console.log("  Management       : gm@solidxpress.com.my");
  console.log("  HR Admin         : hr@solidxpress.com.my");
  console.log("  Finance Admin    : finance@solidxpress.com.my");
  console.log("  Sales Head       : sales.head@solidxpress.com.my");
  console.log("  Staff (Sales)    : michelle@solidxpress.com.my");
  console.log("  Staff (Runner)   : azman@solidxpress.com.my");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
