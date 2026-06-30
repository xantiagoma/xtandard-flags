/** @type {import('next').NextConfig} */
const nextConfig = {
  // @xtandard/flags is linked via file:../.. — let Next transpile it.
  transpilePackages: ["@xtandard/flags"],
};
export default nextConfig;
