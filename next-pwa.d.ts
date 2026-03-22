declare module "next-pwa" {
  import type { NextConfig } from "next";

  interface NextPwaOptions {
    dest: string;
    disable?: boolean;
    register?: boolean;
    skipWaiting?: boolean;
    scope?: string;
    sw?: string;
    fallbacks?: {
      document?: string;
      image?: string;
      audio?: string;
      video?: string;
      font?: string;
    };
  }

  export default function withPWA(
    options: NextPwaOptions
  ): (nextConfig?: NextConfig) => NextConfig;
}
