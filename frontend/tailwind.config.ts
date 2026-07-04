import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#182026",
        muted: "#69747c",
        line: "#d9dee2",
        paper: "#ffffff",
        wash: "#f5f7f8",
        teal: "#0f766e",
        coral: "#b42318",
        amber: "#a16207",
        violet: "#6d5dfc"
      },
      boxShadow: {
        crisp: "0 1px 2px rgba(24, 32, 38, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
