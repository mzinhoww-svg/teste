import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM AI Studio",
  description:
    "CRM privado orquestrado por agentes de IA — do lead ao pós-venda, com funil, propostas, contratos e automações.",
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={GeistSans.variable}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
