import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium-min"],
};

export default nextConfig;
