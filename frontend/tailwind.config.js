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
          50: '#f2f7f3',
          100: '#e0ece2',
          200: '#c3d8c7',
          300: '#a3c3a9',
          400: '#82a783',
          500: '#668b6d',
          600: '#507058',
          700: '#425a49',
          800: '#38493d',
          900: '#2f3c33',
          950: '#18201a'
        },
        forest: '#2f5f49',
        plum: '#681d4c'
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
