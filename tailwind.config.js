/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#A259FF',
        secondary: '#8B30FF',
        plum: '#2A1E5C',
        softPink: '#FF70A6',
        softGray: '#FDF7F3',
        mutedGray: '#A8A6B8',
        darkText: '#333333',
        gold: '#FFD700',
      },
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
        display: ['Montserrat', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 8px rgba(162, 89, 255, 0.3)',
      },
      borderRadius: {
        lg: '12px',
      },
    },
  },
  plugins: [],
};
