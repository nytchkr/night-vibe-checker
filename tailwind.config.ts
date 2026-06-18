import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "neon-cyan": "#00F5D4",
        "neon-magenta": "#FF2D78",
        "bg-deep": "#0A0A0F",
        "bg-card": "#141420",
        "bg-elevated": "#1E1E2E",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
