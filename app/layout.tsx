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

// Evita "flash" do tema errado: aplica a classe `dark` antes da hidratação,
// lendo a preferência salva ou a do sistema.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
