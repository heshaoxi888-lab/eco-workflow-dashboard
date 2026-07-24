import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "ECO 团队工作流｜Cloudflare 协作版";
  const description = "ECO organic cosmetics 五人团队内容协作、排期、KPI、BD 与 GEO 管理看板。";
  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: { title, description, type: "website", url: origin, images: [{ url: `${origin}/og.jpg`, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.jpg`] }
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
