import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM AI Studio — Privado",
  description:
    "Versão privada do CRM AI Studio: funis de vendas orquestrados por agentes de IA — Lead Scoring, Sales Copilot, Proposal e Activities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
