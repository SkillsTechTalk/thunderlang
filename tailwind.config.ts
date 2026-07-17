import type { Config } from "tailwindcss";

/**
 * ThunderLang re-skin. The palette KEY `gold` is retained so the many existing
 * `gold-*` utility classes across the site render the new electric-violet "bolt"
 * accent without touching every file. `rose` carries the cyan gradient tail.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Deep navy canvas.
        ink: {
          950: "#05070E",
          900: "#080B14",
          850: "#0A0E1A",
          800: "#0E1322",
          700: "#141B2E",
          600: "#1B2438",
        },
        // Electric-violet "bolt" accent (retains the `gold` key for compatibility).
        gold: {
          100: "#EDE9FE",
          200: "#D6CCFF",
          300: "#B49BFF",
          400: "#9A7CF7",
          500: "#7C5CF0",
          600: "#6538D9",
        },
        // Cyan spark used for the wordmark gradient tail.
        rose: {
          200: "#A5F3FC",
          300: "#67E8F9",
        },
        haze: {
          100: "#EAF0FA",
          200: "#C7D1E2",
          300: "#9AA6BD",
          400: "#6B778D",
          500: "#4A5468",
        },
      },
      opacity: {
        8: "0.08",
        12: "0.12",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      maxWidth: {
        content: "1120px",
        prose: "760px",
      },
      boxShadow: {
        glow: "0 0 80px -20px rgba(124, 92, 240, 0.45)",
        panel: "0 24px 60px -30px rgba(0, 0, 0, 0.9)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.65", transform: "scale(1)" },
          "45%": { opacity: "1", transform: "scale(1.08)" },
          "55%": { opacity: "0.85", transform: "scale(1.02)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
        twinkle: "twinkle 4.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
