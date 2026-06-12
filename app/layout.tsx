import type { Metadata } from "next";

import { AuthSessionProvider } from "@/components/providers/session-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "EvoHome CRM — Real estate workspace",
  description:
    "Operational CRM for real estate teams. Leads, properties, pipeline, activities and email drips in one calm workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased text-[15px] leading-relaxed">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
