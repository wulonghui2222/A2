// A2: bolt uses UnoCSS (not PostCSS). This empty config stops Vite's config
// search from walking up into A2-new/postcss.config.mjs (the retired Next.js
// app's Tailwind config), which fails to resolve @tailwindcss/postcss here.
export default {};
