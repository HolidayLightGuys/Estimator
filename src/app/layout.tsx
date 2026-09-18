import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "Holiday Light Guys Estimator",
  description: "Internal estimator tool for Holiday Light Guys installation quotes.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-50 text-hlg-charcoal antialiased">{children}</body>
    </html>
  );
}
