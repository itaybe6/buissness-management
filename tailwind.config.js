/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Heebo", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "var(--ink)",
        bar: "var(--bar)",
        accent: { DEFAULT: "var(--accent)", 2: "var(--accent-2)", tint: "var(--accent-tint)" },
        brand: {
          50: "var(--brand-50)",
          100: "var(--brand-100)",
          200: "var(--brand-200)",
          600: "var(--brand-600)",
          700: "var(--brand-700)",
          800: "var(--brand-800)",
        },
        bg: "var(--bg)",
        surface: { DEFAULT: "var(--surface)", 2: "var(--surface-2)" },
        sidebar: "var(--sidebar)",
        border: { DEFAULT: "var(--border)", 2: "var(--border-2)" },
        text: { DEFAULT: "var(--text)", 2: "var(--text-2)", 3: "var(--text-3)" },
        success: { DEFAULT: "var(--success)", bg: "var(--success-bg)" },
        warning: { DEFAULT: "var(--warning)", bg: "var(--warning-bg)" },
        danger: { DEFAULT: "var(--danger)", bg: "var(--danger-bg)" },
        info: { DEFAULT: "var(--info)", bg: "var(--info-bg)" },
        violet: { DEFAULT: "var(--violet)", bg: "var(--violet-bg)" },
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
        card: "var(--radius)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        lg: "var(--shadow-lg)",
      },
      keyframes: {
        fadeUp: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: { from: { opacity: "0", transform: "scale(.95)" }, to: { opacity: "1", transform: "none" } },
        pulse2: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".45" } },
        shimmer: { "100%": { transform: "translateX(-100%)" } },
        riseIn: { from: { opacity: "0", transform: "translateY(16px) scale(.97)" }, to: { opacity: "1", transform: "none" } },
        bumpUp: { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.18)" }, "100%": { transform: "scale(1)" } },
      },
      animation: {
        fadeUp: "fadeUp .35s ease",
        fadeIn: "fadeIn .3s ease",
        pop: "pop .15s ease",
        riseIn: "riseIn .5s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};
