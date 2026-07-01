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
      { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
      { href: "/ceremony", label: "Recognition", icon: "🎤" },
    ],
  },
  {
    group: "Work",
    items: [
      { href: "/missions", label: "Mission Board", icon: "🎯" },
      { href: "/jobs", label: "Job Board", icon: "📦" },
      { href: "/kpi", label: "KPI Dashboard", icon: "📈" },
      { href: "/kpi-setup", label: "KPI Setup", icon: "⚙️", roles: ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD"] },
      { href: "/daily-report", label: "Daily Report", icon: "📝" },
    ],
  },
  {
    group: "Rewards & Growth",
    items: [
      { href: "/wallet", label: "Points Wallet", icon: "💎" },
      { href: "/rewards", label: "Reward Store", icon: "🎁" },
      { href: "/badges", label: "Badge Centre", icon: "🏅" },
      { href: "/lucky-draw", label: "Lucky Draw", icon: "🎰" },
      { href: "/training", label: "Training Centre", icon: "📚" },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/points-admin", label: "Points Admin", icon: "⚖️", roles: ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "HR_ADMIN"] },
      { href: "/coaching", label: "Coaching Centre", icon: "🎓", roles: ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "HR_ADMIN"] },
      { href: "/reviews", label: "Performance Review", icon: "🗂️", roles: ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "HR_ADMIN"] },
      { href: "/finance", label: "Finance Control", icon: "💰", roles: ["SUPER_ADMIN", "MANAGEMENT", "FINANCE_ADMIN"] },
      // User admin — same page, role-appropriate label.
      { href: "/users", label: "User Management", icon: "👥", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
      { href: "/users", label: "Staff Directory", icon: "👥", roles: ["MANAGEMENT"] },
      { href: "/users", label: "My Team", icon: "👥", roles: ["DEPARTMENT_HEAD"] },
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
