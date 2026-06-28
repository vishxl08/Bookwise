/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        body: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        cream: "#F5F0E8",
        parchment: "#EFE2CF",
        ink: "#3B2314",
        cocoa: "#6E4124",
        olive: "#6D7254",
        berry: "#7B3F57",
        brass: "#B78343",
        fog: "#D7CDC0"
      },
      boxShadow: {
        paper: "0 18px 45px rgba(59, 35, 20, 0.13)"
      }
    }
  },
  plugins: []
};
