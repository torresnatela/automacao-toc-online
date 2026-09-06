import { parsePeriod, taxIdMatches } from "@toc/core/domain";
import { AtIntegrityError, AtTransientError } from "../errors";

/**
 * As três perguntas a fazer ao ficheiro **antes** de o guardar: é mesmo um PDF,
 * é mesmo desta empresa, é mesmo deste período.
 *
 * Estão aqui, puras e sobre valores simples, e não a meio do adaptador, por
 * duas razões. A primeira é que guardar primeiro e verificar depois deixa a
 * guia de outro contribuinte no Storage do gabinete — e apagá-la a seguir não
 * desfaz o RGPD. A segunda é que o desfecho tem de sair da **classe do erro**,
 * não de um `if` na orquestração: `AtTransientError` quando vale a pena voltar
 * a descarregar, `AtIntegrityError` (estrutural) quando repetir só traria o
 * mesmo ficheiro errado.
 *
 * As mensagens são texto nosso: nunca o HTML do portal, nunca um NIF, nunca um
 * valor. Elas acabam num `last_error` que o dashboard mostra.
 */

/** Um PDF a sério tem pelo menos isto — abaixo é download cortado, não guia. */
const TAMANHO_MINIMO_BYTES = 1000;
/** Só o início interessa: é aí que uma página de erro se denuncia. */
const JANELA_DE_INSPECAO = 1024;

/**
 * O que veio é mesmo um PDF inteiro?
 *
 * Falha **retentável** de propósito: um ficheiro sem `%PDF-`, curto de mais ou
 * com HTML lá dentro é quase sempre um download interrompido ou a página de
 * manutenção da AT — as duas coisas passam sozinhas. Tratá-lo como estrutural
 * mandaria um humano olhar para uma falha que a tentativa seguinte resolve.
 *
 * O `<html` é procurado **depois** do cabeçalho estar certo porque a AT já
 * serve páginas de erro com o `Content-Type` do PDF: o cabeçalho sozinho não
 * chega.
 */
export function assertPdfIntegrity(buf: Buffer): void {
  if (!buf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    throw new AtTransientError("document_capture_failed", "O ficheiro descarregado não é um PDF.");
  }
  if (buf.length < TAMANHO_MINIMO_BYTES) {
    throw new AtTransientError("document_capture_failed", "O PDF descarregado está truncado.");
  }
  if (buf.subarray(0, JANELA_DE_INSPECAO).toString("latin1").toLowerCase().includes("<html")) {
    throw new AtTransientError(
      "document_capture_failed",
      "O portal devolveu uma página em vez do PDF.",
    );
  }
}

/**
 * A guia é mesmo desta empresa?
 *
 * Só bloqueia quando os dois lados **afirmam** NIFs diferentes. Ausente ou
 * ilegível não é prova de nada — e bloquear aí faria um PDF bom com um campo
 * mal lido parecer uma troca de contribuinte, que é o alarme que ninguém pode
 * aprender a ignorar.
 */
export function assertDocumentBelongsTo(expectedNif: string | null, foundNif: string | null): void {
  if (expectedNif === null || foundNif === null) return;
  // `taxIdMatches` devolve `null` quando um dos lados não tem dígitos: ilegível,
  // não divergente.
  if (taxIdMatches(foundNif, expectedNif) === false) {
    throw new AtIntegrityError(
      "document_fields_mismatch",
      "O NIF impresso na guia não é o da empresa.",
    );
  }
}

/**
 * A guia é mesmo do período que se foi buscar?
 *
 * Um período presente mas ilegível **acusa**, ao contrário do NIF: guardar aí
 * seria arquivar um ficheiro de período desconhecido com o nome do período
 * pedido, e o nome é a chave por que o gabinete o vai procurar.
 */
export function assertPeriodMatches(expected: string, found: string | null): void {
  if (found === null) return;
  const lido = parsePeriod(found);
  if (lido.ok && lido.period === expected) return;
  throw new AtIntegrityError(
    "document_fields_mismatch",
    "O período impresso na guia não é o período pedido.",
  );
}

/** O NIF que a página afirma estar a mostrar. Só dígitos, nunca guardado. */
const NIF_NO_TEXTO = /NIF[:\s]+(\d{9})/;

/**
 * A sessão aberta no portal é mesmo a desta empresa?
 *
 * Partilhada pelas duas rotas: na B o portal reaproveita a sessão do último
 * cliente escolhido; na A é a extensão que faz o login, e um guião que
 * entrasse com a senha de outra empresa daria exatamente o mesmo sintoma. Só
 * se acusa quando os dois lados **afirmam** NIFs diferentes — um NIF ausente ou
 * ilegível na página não prova nada. Nem a mensagem nem o fingerprint levam
 * NIFs: este erro acaba num `last_error` que o dashboard mostra.
 */
export function assertSessionBelongsTo(pageText: string, expectedNif: string | null): void {
  if (expectedNif === null) return;
  const mostrado = NIF_NO_TEXTO.exec(pageText)?.[1] ?? null;
  if (mostrado !== null && taxIdMatches(mostrado, expectedNif) === false) {
    throw new AtIntegrityError(
      "at_session_mismatch",
      "A sessão aberta no portal não é a do contribuinte pedido.",
      {},
    );
  }
}
