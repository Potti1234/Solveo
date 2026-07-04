import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        amber: "hsl(var(--amber))",
        violet: "hsl(var(--violet))",
        ink: "#182026",
        line: "#d9dee2",
        paper: "#ffffff",
        wash: "#f5f7f8",
        teal: "#0f766e",
        coral: "#b42318"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)"
      },
      boxShadow: {
        crisp: "0 1px 2px rgba(24, 32, 38, 0.08)",
        popover: "0 8px 24px rgba(24, 32, 38, 0.14)",
        dialog: "0 20px 48px rgba(24, 32, 38, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
