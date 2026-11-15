/** @type {import('tailwindcss').Config} */
// Design tokens for the CRM. Brand identity (amber accent on deep ink) is preserved;
// these tokens standardize color, radius, shadow and type scale across every page.
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "IBM Plex Sans", "sans-serif"],
      },
      colors: {
        // Primary accent (brand amber)
        primary: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },
        // Neutral ink used for text, sidebar and surfaces
        ink: {
          50: "#f5f7fb",
          100: "#edf1f7",
          200: "#e5eaf1",
          300: "#cdd5e1",
          400: "#9aa5b6",
          500: "#68758a",
          600: "#4e5a6e",
          700: "#364257",
          800: "#232e45",
          900: "#172033",
          950: "#101b35",
        },
        // Legacy pages use `slate-*` directly: map it to the same navy-tinted scale so the
        // whole app shares one neutral palette.
        slate: {
          50: "#f5f7fb",
          100: "#edf1f7",
          200: "#e5eaf1",
          300: "#cdd5e1",
          400: "#9aa5b6",
          500: "#68758a",
          600: "#4e5a6e",
          700: "#364257",
          800: "#232e45",
          900: "#172033",
          950: "#101b35",
        },
        success: { 50: "#ecfdf5", 500: "#10b981", 600: "#059669", 700: "#047857" },
        danger: { 50: "#fef2f2", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c" },
        // Legacy alias kept for existing usages
        brand: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
      },
      borderRadius: {
        card: "0.875rem",
        control: "0.5rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.03)",
        "card-hover": "0 8px 24px -8px rgb(15 23 42 / 0.12), 0 2px 6px -2px rgb(15 23 42 / 0.05)",
        pop: "0 16px 40px -12px rgb(15 23 42 / 0.25), 0 4px 12px -4px rgb(15 23 42 / 0.08)",
        focus: "0 0 0 4px rgb(245 158 11 / 0.15)",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.97)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "slide-up": "slide-up 200ms ease-out",
        "scale-in": "scale-in 160ms ease-out",
      },
    },
  },
  plugins: [],
};
