import * as React from "react";
import { Logo } from "@/components/brand/logo";
import { WaveMotif } from "@/components/brand/wave-motif";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/** Layout das telas de autenticação: painel de marca + card do formulário. */
function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Painel de marca (verde-pinho) */}
      <div className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <WaveMotif className="pointer-events-none absolute inset-0 text-white/10" />
        <div className="relative">
          <Logo variant="onDark" />
        </div>
        <div className="relative max-w-sm">
          <p className="font-display text-3xl font-medium leading-tight tracking-tight text-white">
            Mais do que contar, ajudamos a prosperar.
          </p>
          <p className="mt-3 text-sm text-sidebar-muted">
            Automação do ciclo mensal de guias fiscais.
          </p>
        </div>
        <p className="relative text-xs text-sidebar-muted">© Cliconta</p>
      </div>

      {/* Área do formulário */}
      <div className="flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo variant="onLight" />
          </div>
          <Card>
            <CardHeader>
              <h1 className="text-xl font-medium">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

export { AuthLayout };
