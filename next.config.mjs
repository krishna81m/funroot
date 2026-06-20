/** @type {import('next').NextConfig} */
const nextConfig = {
  // Include quiz JSON files in Vercel's serverless function bundles
  outputFileTracingIncludes: {
    '/api/**': ['./data/quizzes/**', './lib/**'],
  },
}

export default nextConfig
