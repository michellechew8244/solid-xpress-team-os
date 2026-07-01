# Solid Xpress Team OS

Team management, KPI, gamification and performance-reward platform for **Solid Xpress M Sdn Bhd** (total logistics, Malaysia).

Turn company goals → department goals → daily staff actions → measurable KPI → points, ranking, rewards, coaching and promotion path.

---

## Quick start

**Prerequisite:** a PostgreSQL database. The easiest local option is the bundled Docker file:

```bash
docker compose up -d           # starts Postgres 16 on localhost:5432
```

Or point `DATABASE_URL` in `.env` at any Postgres (Neon, Supabase, RDS, a local install…).

```bash
npm install
cp .env.example .env            # then set DATABASE_URL + AUTH_SECRET
npm run setup                   # generate Prisma client + create tables + seed sample data
npm run dev                     # http://localhost:3939
```

> Already set up? `npm run db:reset` wipes & reseeds, then `npm run dev`.
> Prefer migrations over `db push`? Run `npm run db:migrate` (creates `prisma/migrations`).

### Demo logins (password for all: `password123`)

| Role | Email |
|------|-------|
| Boss / Super Admin | `boss@solidxpress.com.my` |
| Management | `gm@solidxpress.com.my` |
| Department Head (Sales) | `sales.head@solidxpress.com.my` |
| Staff (Sales) | `michelle@solidxpress.com.my` |
| Staff (Runner) | `azman@solidxpress.com.my` |
| HR Admin | `hr@solidxpress.com.my` |
| Finance Admin | `finance@solidxpress.com.my` |

Each role sees a different dashboard and a different slice of the data.

---

## Tech stack

- **Next.js 15** (App Router, Server Components + Server Actions) + **TypeScript**
- **Tailwind CSS** — professional logistics SaaS look, red/yellow/green status, mobile responsive
- **PostgreSQL** + **Prisma 7** ORM, via the pure-JS `@prisma/adapter-pg` driver adapter
  (works on **Windows ARM64**, where Prisma's native x64 engine can't load)
- **NextAuth / Auth.js v5** — Credentials provider (email + password), JWT session strategy,
  **bcrypt** password hashing, role + department carried in the token for RBAC
- **Recharts** for dashboards
- Optional **Claude API** for AI assistant features (falls back to offline templated summaries)

### Notes on the stack
- **Auth:** `src/lib/nextauth.ts` holds the Auth.js config; `src/lib/auth.ts` wraps it with
  `getSession()` / `getCurrentUser()` so every page/action reads the session the same way.
  The `/api/auth/[...nextauth]` route serves the Auth.js endpoints.
- **ARM64:** Prisma 7 is engine-less (WASM query compiler); the `pg` adapter is pure JavaScript,
  so no native engine DLL is needed. To use a different DB, swap the adapter in `src/lib/prisma.ts`.
- **Enums:** status/role/grade fields are stored as documented `String` values (see
  `src/lib/enums.ts`) — portable and low-churn; promote to native Postgres enums later if desired.

---

## Project structure

```
prisma/
  schema.prisma        # all 26 models (section P)
  seed.ts              # rich Solid Xpress sample data
prisma.config.ts       # Prisma 7 datasource config (migration engine)
src/
  app/
    login/             # auth pages + server action
    (app)/             # authenticated shell (sidebar + topbar)
      dashboard/       # role-based: Boss / Department / Staff
      missions/        # Mission Board (tasks) + detail + actions
      jobs/            # logistics Job Board + milestones
      kpi/  leaderboard/  wallet/  rewards/  badges/  training/
      daily-report/  coaching/  reviews/  finance/  users/  notifications/
    api/ai/            # AI assistant endpoint (Claude or fallback)
  components/          # UI primitives, charts, dashboards, forms
  lib/                 # prisma, auth, rbac, points engine, notify, ai, enums, format
  services/            # dashboard aggregation, overdue sweep
```

---

## Modules (MVP)

Authentication · Role-based dashboards · User & department management · Mission Board (tasks
with owner / deadline / status / proof / approval) · Logistics Job Board with shipment
milestones · KPI setup & tracking · Points wallet & ledger · Monthly + per-department
leaderboard · Reward store with HR approval flow · Badges & growth levels · Daily check-in ·
Coaching records · Performance reviews · Finance control (billing / GP / collection) ·
In-app notifications · AI assistant panels.

### Performance engine (KPI · points · penalty · reward · badge · lucky draw)
- **KPI entry & review** (`/kpi`): staff key in actual values; a manager approves to credit points.
  `KPI Points = achievement rate × multiplier, capped at maxPoints` (`src/lib/points.ts`).
- **Penalty engine** (`/points-admin`): managers apply seeded **universal deduction rules**
  (overdue, no proof, wrong entry, complaint, red-line, …). The UI **requires confirming the
  cause is internal** — external problems (vessel/customs/port/weather/etc.) are never deducted.
  Red-line cases escalate to the boss; high-severity rules auto-create coaching.
- **Special contribution points**: managers award recognition (prevent penalty +200, save cost,
  customer compliment, mentor, SOP, etc.) and free-form manual adjustments.
- **Task points**: `base × difficulty (1.0–2.5) × timeliness (0–1.2)` multipliers.
- **Monthly grade** (`/reviews`, "Generate Reviews"): auto-computed weighted score
  `KPI 50% + Task 20% + Accuracy 15% + Teamwork 10% + Discipline 5%` → grade **A+ … E**
  (`src/services/scoring.ts`).
- **Automatic coaching triggers**: score < 70, KPI < 70%, deductions > 100/month, > 3 overdue,
  repeated mistake, complaint, or red-line → an OPEN coaching record (de-duplicated per month).
- **Lucky Draw** (`/lucky-draw`): campaigns with multiple prizes; staff earn entries from
  performance signals or buy them with points; admin runs a **weighted random draw** (a winner
  can't win twice in a campaign); results recorded permanently.

### Core access / integrity rules (enforced in code)
- Points are awarded **only after a reviewer approves** a task or KPI result.
- A staff member **cannot approve their own task** (department heads approve their team; boss can override).
- Penalties apply to **internal-cause issues only** — external delays are protected.
- AI never approves points, rewards, penalties, lucky draw or coaching — humans decide.
- Finance data is visible only to Boss / Management / Finance Admin.
- Staff see their own data only; department heads see their department; boss sees everything.
- Leaderboard ranks by **points earned in the current month**.

---

## AI assistant (optional)

AI buttons (Boss weekly summary, Staff priorities, Department review, Daily-report polish)
call `/api/ai`. With no `ANTHROPIC_API_KEY` set, they return deterministic offline summaries
built from real data. Add a key in `.env` to use live Claude. **AI never makes approval
decisions — final approval always belongs to a human manager.**

---

## Built for future phases

The schema and a single notification creation point (`src/lib/notify.ts`) are designed so later
phases can add: WhatsApp / email notifications, Google Sheet import, payroll & attendance
integration, customer portal, shipment-tracking integration, a mobile app, and advanced AI
coaching & finance automation — without reworking the core.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run setup` | generate + db push + seed |
| `npm run db:reset` | Wipe & reseed the database |
| `npm run db:seed` | Seed only |
