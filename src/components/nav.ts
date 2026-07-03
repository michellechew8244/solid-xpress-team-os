/** Sidebar navigation config with role-based visibility. */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Roles allowed to see this item. Empty = everyone. */
  roles?: string[];
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "📊" },
      { href: "/announcements", label: "Announcements", icon: "📢" },
      { href: "/forum", label: "Staff Forum", icon: "💬" },
      { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
      { href: "/achievement-wall", label: "Achievement Wall", icon: "🏛️" },
      { href: "/ceremony", label: "Recognition", icon: "🎤" },
      { href: "/reports", label: "Monthly Report", icon: "📑", roles: ["SUPER_ADMIN", "MANAGEMENT", "HR_ADMIN"] },
    ],
  },
  {
    group: "Work",
    items: [
      { href: "/attendance", label: "Attendance Centre", icon: "⏰" },
      { href: "/proposals", label: "Idea Bank", icon: "💡" },
      { href: "/missions", label: "Mission Board", icon: "🎯" },
      { href: "/jobs", label: "Job Board", icon: "📦" },
      { href: "/kpi", label: "KPI Dashboard", icon: "📈" },
      { href: "/kpi-setup", label: "KPI Setup", icon: "⚙️", roles: ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD"] },
      { href: "/daily-report", label: "Daily Report", icon: "📝" },
      { href: "/work-reports", label: "Work Reports", icon: "📄" },
    ],
  },
  {
    group: "Rewards & Growth",
    items: [
      { href: "/wallet", label: "Diamond Wallet", icon: "💎" },
      { href: "/missions-hub", label: "Game Centre", icon: "🎮" },
      { href: "/pk-arena", label: "PK Arena", icon: "⚔️" },
      { href: "/rewards", label: "Reward Store", icon: "🎁" },
      { href: "/badges", label: "Badge Centre", icon: "🏅" },
      { href: "/lucky-draw", label: "Lucky Draw", icon: "🎰" },
      { href: "/wishing-tree", label: "Wishing Tree", icon: "🌳" },
      { href: "/training", label: "Training Centre", icon: "📚" },
    ],
  },
  {
    group: "Diamonds",
    items: [
      { href: "/owner/diamonds", label: "Diamond Control Centre", icon: "💠", roles: ["SUPER_ADMIN", "MANAGEMENT"] },
      { href: "/diamonds/requests", label: "Diamond Requests", icon: "📥", roles: ["SUPER_ADMIN", "MANAGEMENT", "HR_ADMIN", "DEPARTMENT_HEAD"] },
      { href: "/diamonds/transactions", label: "Diamond Transactions", icon: "🧾" },
      { href: "/settings/diamond-authority", label: "Diamond Authority", icon: "🔐", roles: ["SUPER_ADMIN", "MANAGEMENT"] },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/points-admin", label: "Diamond Admin", icon: "⚖️", roles: ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "HR_ADMIN"] },
      { href: "/coaching", label: "Coaching Centre", icon: "🎓", roles: ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "HR_ADMIN"] },
      { href: "/reviews", label: "Performance Review", icon: "🗂️", roles: ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "HR_ADMIN"] },
      { href: "/finance", label: "Finance Control", icon: "💰", roles: ["SUPER_ADMIN", "MANAGEMENT", "FINANCE_ADMIN"] },
      // User admin — same page, role-appropriate label.
      { href: "/users", label: "User Management", icon: "👥", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
      { href: "/users", label: "Staff Directory", icon: "👥", roles: ["MANAGEMENT"] },
      { href: "/users", label: "My Team", icon: "👥", roles: ["DEPARTMENT_HEAD"] },
      { href: "/onboarding", label: "Onboarding", icon: "📋" },
      { href: "/departments", label: "Departments", icon: "🏢", roles: ["SUPER_ADMIN", "MANAGEMENT", "HR_ADMIN"] },
      { href: "/profile", label: "My Profile", icon: "🪪" },
    ],
  },
];

export function visibleNav(role: string): NavGroup[] {
  return NAV.map((g) => ({
    group: g.group,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}
