/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vermilion: '#E23D28',
        gold: '#D4A017',
      },
      fontFamily: {
        chinese: ["'PingFang SC'", "'Microsoft YaHei'", "'Noto Sans SC'", 'sans-serif'],
      },
    },
  },
  plugins: [],
};