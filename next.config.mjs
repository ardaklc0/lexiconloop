/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? "",
  },
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
