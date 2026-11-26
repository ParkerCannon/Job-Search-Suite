import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#080b14",
          900: "#0d1220",
          850: "#111829",
          800: "#161e33",
          700: "#222d47",
          600: "#33415f",
        },
        accent: {
          400: "#7dd3fc",
          500: "#38bdf8",
          600: "#0ea5e9",
        },
        mint: {
          400: "#6ee7b7",
          500: "#34d399",
          600: "#10b981",
        },
      },
      boxShadow: {
        glow: "0 0 40px -12px rgba(56,189,248,0.45)",
        card: "0 12px 40px -20px rgba(0,0,0,0.8)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
