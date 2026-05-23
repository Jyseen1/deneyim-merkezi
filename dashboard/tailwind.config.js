/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gx: {
          bg: "#0A0A0F",
          "bg-deep": "#070709",
          surface: "#16161D",
          "surface-2": "#1C1A2A",
          accent: "#7C3AED",
          "accent-light": "#8B5CF6",
          text: "#FFFFFF",
          "text-muted": "#A1A1AA",
          "text-hint": "#71717A",
          success: "#4ADE80",
          warning: "#FBBF24",
          danger: "#EF4444",
        },
      },
    },
  },
  plugins: [],
};
