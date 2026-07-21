import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// Subpath edge-safe (sem node:crypto) — o middleware roda no runtime Edge.
import { shouldRedirectToChangePassword } from "@toc/core/auth/guard";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Rotas de API são uma superfície REST: deixamos o route handler responder com
  // JSON (401/403) em vez de redirecionar para a página de login (HTML). O cookie
  // de sessão ainda é renovado via `response`.
  const isApi = path === "/api" || path.startsWith("/api/");

  if (!user) {
    if (isApi) return response;
    if (!path.startsWith("/login")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  // Usuário autenticado: força a troca de senha no 1º acesso enquanto a flag
  // estiver ativa. A flag vem do app_metadata do JWT (getUser já foi chamado
  // acima — sem query extra ao banco). A função pura trata o anti-loop.
  if (!isApi) {
    const target = shouldRedirectToChangePassword({
      authenticated: true,
      mustChangePassword: user.app_metadata?.must_change_password === true,
      path,
    });
    if (target) {
      return NextResponse.redirect(new URL(target, request.url));
    }
  }
  return response;
}
