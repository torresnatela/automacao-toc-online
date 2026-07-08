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

  if (!user) {
    if (!path.startsWith("/login")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  // Usuário autenticado: força a troca de senha no 1º acesso enquanto a flag
  // must_change_password estiver ativa. A função pura trata o anti-loop
  // (libera /change-password e /login).
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .single();

  const target = shouldRedirectToChangePassword({
    authenticated: true,
    mustChangePassword: profile?.must_change_password ?? false,
    path,
  });
  if (target) {
    return NextResponse.redirect(new URL(target, request.url));
  }
  return response;
}
