import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One self-contained server for the Docker image: `node server.js`.
  output: "standalone",
};

export default nextConfig;
