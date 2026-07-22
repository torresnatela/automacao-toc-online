import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Hanken_Grotesk } from "next/font/google";

// Hanken Grotesk: substituta próxima do Forma DJR Display da Cliconta.
// Duas instâncias expõem duas CSS vars; --font-hanken-display é o slot que o
// globals.css usa para --font-display (troca única para o Forma DJR real).
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const display = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-hanken-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cliconta",
  description: "Dashboard de automação de guias fiscais",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
