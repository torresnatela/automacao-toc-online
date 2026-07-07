import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Automação TOConline",
  description: "Dashboard de automação de guias fiscais",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt">
      <body style={{ fontFamily: "system-ui, -apple-system, sans-serif", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
