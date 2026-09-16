import type { Metadata } from "next";
import { WalletProvider } from "@/lib/wallet-context";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "QUORDA — Neutral procurement clearing",
  description:
    "Neutral procurement clearing for autonomous buyers and sellers, adjudicated by GenLayer validator consensus.",
  icons: { icon: "/logo.jpg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <SiteHeader />
          <main className="page">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
