import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark:  '#0D1117',
          dark2: '#161B22',
          dark3: '#21262D',
        },
        stage: {
          aw:  { header: '#7F1D1D', bg: '#FEF2F2', row: '#FFF5F5' },
          co:  { header: '#78350F', bg: '#FFFBEB', row: '#FEFCE8' },
          cv:  { header: '#064E3B', bg: '#F0FDF4', row: '#ECFDF5' },
        },
      },
    },
  },
  plugins: [],
}
export default config
