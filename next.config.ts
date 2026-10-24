import type { NextConfig } from "next";

// Static export into out/, which Capacitor bundles into the iOS and Android apps.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
