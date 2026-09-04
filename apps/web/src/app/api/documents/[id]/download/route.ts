import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { logUserEvent } from "@/lib/observability/tracer";

/**
 * `GET /api/documents/:id/download` — a ÚNICA porta para o PDF de uma guia.
 *
 * O bucket `documents` é privado e **não tem policy de leitura** para
 * `authenticated` (ver `20260904015903_iva_documents_rls.sql`): ninguém alcança
 * o ficheiro com o token da sessão. Quem decide é esta rota, em dois passos que
 * não podem trocar de ordem — primeiro lê a linha `documents` com o cliente
 * **RLS** (é a RLS que responde "esta guia é da tua equipa?"), só depois assina
 * com a service role.
 *
 * Porquê 302 e não JSON com a URL: um `<a href target="_blank">` na listagem
 * passa a funcionar sem uma linha de JavaScript, e a URL assinada nunca entra
 * no DOM nem no HTML servido — vive só no header `Location` desta resposta.
 *
 * Porquê não fazer proxy do ficheiro: gastaria banda e tempo de função da
 * Vercel para reentregar bytes que o storage já sabe servir, sem ganho de
 * segurança — o controlo de acesso já aconteceu antes de assinar.
 *
 * Porquê 60 s: a URL assinada é um portador (quem a tiver, abre). 60 s chegam
 * para o browser seguir o redirecionamento e não chegam para a URL sobreviver
 * num histórico, num log de proxy ou num "copiar link".
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nunca 403: um id de outra equipa é indistinguível de um id inexistente. */
function naoEncontrado(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 404 });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  // Um id malformado é 404 e não 500: sem esta guarda o Postgres recusaria o
  // cast para uuid e a rota rebentaria a quem escrevesse mal a URL.
  if (!UUID.test(id)) return naoEncontrado("Documento não encontrado.");

  // Cliente RLS de propósito: a visibilidade da linha É a autorização. Guia de
  // outra equipa simplesmente não existe para este utilizador.
  const supabase = await getSupabaseServerClient();
  const { data: documento, error: erroLeitura } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  // Uma falha de infraestrutura e uma guia invisível dão a MESMA resposta — o
  // 404 é o que resiste à enumeração de ids —, mas não podem dar o mesmo
  // silêncio: sem esta linha uma base em baixo passaria por "não encontrado" e
  // não deixaria rasto em lado nenhum. O `code` do PostgREST não traz nada
  // sensível.
  if (erroLeitura) {
    console.error("[documents] falha ao ler a linha", { documentId: id, code: erroLeitura.code });
  }

  if (!documento) return naoEncontrado("Documento não encontrado.");

  const storagePath = documento.storage_path as string | null;
  // A linha existe mas o RPA ainda não subiu o ficheiro — distinguir ajuda quem
  // está à espera da guia, e não revela nada a quem não a pode ver (esse já
  // levou 404 acima).
  if (storagePath === null) return naoEncontrado("Ficheiro ainda não disponível.");

  const download = req.nextUrl.searchParams.get("download") === "1";
  // Nome do anexo derivado do uuid do documento: sem NIF, sem nome de empresa,
  // sem período — o nome do ficheiro acaba em pastas partilhadas e em anexos de
  // email.
  const filename = `guia-iva-${id.slice(0, 8)}.pdf`;

  const { data: assinada, error } = await getSupabaseAdminClient()
    .storage.from("documents")
    .createSignedUrl(storagePath, 60, download ? { download: filename } : undefined);

  if (error || !assinada) {
    // O caminho no storage é ele próprio a chave do ficheiro: fica fora do log.
    // A mensagem do storage não o inclui hoje, mas é dela que viria — daí a
    // remoção defensiva em vez de confiar. (Com o caminho vazio não há o que
    // remover, e um `split("")` estilhaçaria a mensagem letra a letra.)
    const bruta = error?.message ?? "erro desconhecido";
    const detalhe = storagePath === "" ? bruta : bruta.split(storagePath).join("<caminho>");
    console.error("[documents] falha ao assinar a URL do documento", { documentId: id, detalhe });
    return naoEncontrado("Ficheiro não encontrado no armazenamento.");
  }

  // RGPD: o PDF é um documento de pagamento de um cliente. Aceder a ele é um
  // acesso a dados fiscais de terceiros e tem de deixar rasto de quem e quando.
  // Fail-open: uma falha de observabilidade não pode negar a guia ao contabilista.
  await logUserEvent({ action: "document_downloaded", userId: user.id, data: { documentId: id } });

  const res = NextResponse.redirect(assinada.signedUrl, 302);
  // O `Location` carrega um token válido: nem cache partilhada nem cache do
  // browser o podem guardar.
  res.headers.set("Cache-Control", "private, no-store");
  // E o storage não precisa de saber de que página do dashboard veio o pedido.
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
