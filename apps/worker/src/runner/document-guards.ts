import { parsePeriod, taxIdMatches } from "@toc/core/domain";
import { AtIntegrityError, AtTransientError } from "../errors";
import type { RawPortalDocumentFields } from "./ports";

/**
 * As três perguntas a fazer ao documento **antes** de o guardar.
 *
 * Puras e num ficheiro só seu porque a alternativa é pior de duas maneiras: um
 * `if` a meio do runner esconde a regra entre a orquestração, e guardar
 * primeiro para verificar depois deixa no Storage do gabinete a guia de outro
 * contribuinte. Aqui uma guarda que falha **lança**, e o desfecho sai da classe
 * do erro — `AtTransientError` quando vale a pena voltar a descarregar,
 * `AtIntegrityError` quando repetir só traria o mesmo ficheiro errado.
 *
 * As mensagens são texto nosso: nunca o HTML do portal, o NIF ou o valor.
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
 * manutenção da AT — as duas coisas passam sozinhas. Tratá-lo como erro
 * estrutural mandaria um humano olhar para uma falha que a tentativa seguinte
 * resolve.
 */
export function assertPdfIntegrity(pdf: Buffer): void {
  if (!pdf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    throw new AtTransientError(
      "document_capture_failed",
      "O ficheiro descarregado não é um PDF.",
    );
  }
  if (pdf.length < TAMANHO_MINIMO_BYTES) {
    throw new AtTransientError(
      "document_capture_failed",
      "O PDF descarregado está truncado.",
    );
  }
  if (pdf.subarray(0, JANELA_DE_INSPECAO).toString("latin1").toLowerCase().includes("<html")) {
    throw new AtTransientError(
      "document_capture_failed",
      "O portal devolveu uma página em vez do PDF.",
    );
  }
}

/**
 * A guia é mesmo desta empresa?
 *
 * Só bloqueia quando o portal **afirma** um NIF diferente. Ilegível (`null`)
 * não é prova de nada e já tem o seu próprio desfecho
 * (`fetched_without_fields`); bloquear aí faria um PDF bom com um campo mal
 * lido parecer uma troca de contribuinte.
 */
export function assertDocumentBelongsTo(
  fields: RawPortalDocumentFields,
  companyNif: string | null,
): void {
  if (companyNif === null) return;
  if (taxIdMatches(fields.nif, companyNif) === false) {
    throw new AtIntegrityError(
      "document_fields_mismatch",
      "O NIF impresso na guia não é o da empresa.",
    );
  }
}

/** A guia é mesmo do período que se foi buscar? Campo ausente não acusa nada. */
export function assertPeriodMatches(fields: RawPortalDocumentFields, period: string): void {
  if (fields.period === null) return;
  const lido = parsePeriod(fields.period);
  if (lido.ok && lido.period === period) return;
  throw new AtIntegrityError(
    "document_fields_mismatch",
    "O período impresso na guia não é o período pedido.",
  );
}
