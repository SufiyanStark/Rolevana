import type { NextConfig } from "next";
const nextConfig: NextConfig = { transpilePackages: ["@rolevana/ui", "@rolevana/config", "@rolevana/domain", "@rolevana/job-sources"] };
export default nextConfig;

