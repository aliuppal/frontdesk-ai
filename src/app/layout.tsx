import type { Metadata } from "next";
import { Cal_Sans, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const cal = Cal_Sans({ variable: "--font-cal", subsets: ["latin"], weight: "400", adjustFontFallback: false });

export const metadata: Metadata = {
  title: { default: "FrontDesk AI", template: "%s · FrontDesk AI" },
  description: "An AI receptionist that answers your business phone 24/7 and books appointments into your calendar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${cal.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
