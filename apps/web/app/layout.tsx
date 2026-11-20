import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "PlainTx: plain-English wallet checks",
  description:
    "See which apps can spend your crypto and revoke what you don't need, or check a signature request before you sign it.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render per request: each page carries a fresh CSP nonce (proxy.ts, ADR 0013).
  await connection();
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
