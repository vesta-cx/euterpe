import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["mediabunny", "@mediabunny/mp3-encoder"],
};

export default nextConfig;
