import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://rankbid.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Rankbid — Pay $1 more. Take #1.",
  description:
    "The status board for indie AI & SaaS. Rank = dollars. Rebid only the difference. Takeover locks #1 for hours.",
  openGraph: {
    title: "Rankbid — Pay $1 more. Take #1.",
    description:
      "The status board for indie AI & SaaS. Rank = dollars. Rebid only the difference. Takeover locks #1 for hours.",
    url: siteUrl,
    siteName: "Rankbid",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Rankbid — Pay $1 more. Take #1.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rankbid — Pay $1 more. Take #1.",
    description:
      "The status board for indie AI & SaaS. Rank = dollars. Rebid only the difference. Takeover locks #1 for hours.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
