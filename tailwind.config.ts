import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        hlg: {
          green: "#0B5D2A",       // deep holiday green
          "green-bright": "#138A36", // bright evergreen
          red: "#C62828",         // christmas red
          "red-dark": "#8B0000",  // dark red
          gold: "#F4C542",        // gold/yellow accent
          white: "#FFFFFF",
          charcoal: "#1E1E1E",    // text
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 10px rgba(30, 30, 30, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
