/** @type {import('next').NextConfig} */
const nextConfig = {
  // force clean install by busting Vercel's build cache
  generateBuildId: async () => 'verb-' + Date.now(),
}
module.exports = nextConfig
