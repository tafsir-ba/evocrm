import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { ChunkLoadRecovery } from "@/components/providers/chunk-load-recovery";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { CHUNK_LOAD_RECOVERY_BOOTSTRAP } from "@/lib/chunk-load-recovery-bootstrap";

import "./globals.css";

export const metadata: Metadata = {
  title: "EvoHome CRM — Real estate workspace",
  description:
    "Operational CRM for real estate teams. Leads, properties, pipeline, activities and email drips in one calm workspace.",
};

/** Keep initialScale=1; do not lock maximumScale (a11y). Prevent iOS zoom via ≥16px inputs instead. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased text-[15px] leading-relaxed">
        <Script id="chunk-load-recovery" strategy="beforeInteractive">
          {CHUNK_LOAD_RECOVERY_BOOTSTRAP}
        </Script>
        <AuthSessionProvider>
          <ChunkLoadRecovery>{children}</ChunkLoadRecovery>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
