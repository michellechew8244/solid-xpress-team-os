import type { Config } from "tailwindcss";

/**
 * Solid Xpress Team OS — design tokens.
 * Professional logistics SaaS palette: deep navy + steel blue with a
 * motivating accent. Status colours (red/yellow/green) drive performance UI.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#b9d0ff",
          300: "#8bb0ff",
          400: "#5685fb",
          500: "#2f60f0",
          600: "#1b45d6",
          700: "#1736ad",
          800: "#193189",
          900: "#1a2f6e",
          950: "#141d44",
        },
        ink: {
          DEFAULT: "#0f172a",
          soft: "#334155",
          muted: "#64748b",
        },
        ok: "#16a34a",
        warn: "#d97706",
        danger: "#dc2626",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
