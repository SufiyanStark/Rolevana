import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
  transpilePackages: ["@rolevana/ui", "@rolevana/config", "@rolevana/domain", "@rolevana/job-sources"],
  webpack(config) {
    config.resolve.alias.isarray = path.resolve(process.cwd(), "src/vendor/isarray.cjs");
    return config;
  }
};
export default nextConfig;

