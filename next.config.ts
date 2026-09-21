import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "threadsle.zap-clipper.my.id",
    "*.zap-clipper.my.id",
  ],
  serverExternalPackages: ["pg", "pgvector", "@aws-sdk/client-s3", "@google/adk"],
};

export default nextConfig;
