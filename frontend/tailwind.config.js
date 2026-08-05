/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf4f8',
          100: '#f5e6ee',
          200: '#e9c9d8',
          300: '#d79db7',
          400: '#c16d90',
          500: '#9f476d',
          600: '#63224a',
          700: '#521b3c',
          800: '#42152f',
          900: '#341023',
          950: '#200815'
        },
        sage: {
          50: '#f2f7f4',
          100: '#e3eee9',
          200: '#c8ddd2',
          300: '#a8c8b8',
          400: '#82a793',
          500: '#6b9380',
          600: '#557768',
          700: '#466156',
          800: '#3a5047',
          900: '#31423b',
          950: '#1a2521'
        },
        forest: {
          50: '#eef6f2',
          100: '#d6e9df',
          200: '#aed3c2',
          300: '#7eb49c',
          400: '#529178',
          500: '#3a765f',
          600: '#2f5f49',
          700: '#284f3e',
          800: '#234234',
          900: '#1e372c',
          950: '#101f19'
        },
        plum: '#681d4c'
      },
      fontFamily: {
        sans: ['"Outfit"', 'system-ui', '-apple-system', 'sans-serif']
      }
    }
  },
  plugins: []
};
