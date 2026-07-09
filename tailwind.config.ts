import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Deep navy canvas from the brand mockups
        ink: {
          950: "#05070E",
          900: "#080B14",
          850: "#0A0E1A",
          800: "#0E1322",
          700: "#141B2E",
          600: "#1B2438",
        },
        // Amber / gold star accent
        gold: {
          100: "#FCEFD6",
          200: "#F8DDA9",
          300: "#F5C97A",
          400: "#EEB25A",
          500: "#E09A45",
          600: "#C77F30",
        },
        // Rose-gold used in the "Lang" wordmark gradient
        rose: {
          200: "#F0CBB0",
          300: "#E8B48C",
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
        glow: "0 0 80px -20px rgba(238, 178, 90, 0.35)",
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
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.08)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
        twinkle: "twinkle 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
