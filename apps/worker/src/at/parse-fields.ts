import type { RawPortalDocumentFields } from "../runner/ports";

/**
 * Os campos da guia lidos de texto corrido, e mais nada.
 *
 * A mesma função serve o HTML da página e o texto extraído do PDF, porque a
 * diferença entre os dois é só onde caem as quebras de linha — daí `[:\s]+`
 * entre o rótulo e o valor, que apanha tanto `Entidade: 10800` como `Entidade`
 * numa linha e `10800` na seguinte.
 *
 * Não normaliza nada: a entidade fica com os cinco dígitos, o valor com a
 * vírgula portuguesa, a referência com os espaços com que a AT a imprime, e o
 * período tal como estava escrito. Quem canoniza é o domínio
 * (`normalizeDocumentFields`, `parsePeriod`) — misturar as duas coisas aqui
 * tornaria impossível ver, num diagnóstico, o que o portal disse mesmo.
 *
 * `source` responde a uma pergunta operacional: "isto trouxe alguma coisa?".
 * `"none"` com um PDF válido é o sinal de que o layout mudou e a guia foi
 * guardada sem campos — desfecho `fetched_without_fields`, não falha.
 */

/** Rótulo → valor. Todos ancorados no rótulo em português, todos sem acentuação obrigatória. */
const PATTERNS = {
  /** A entidade de pagamento tem sempre cinco dígitos. */
  entity: /Entidade[:\s]+(\d{5})/i,
  /** A referência vem em grupos separados por espaços; 15-25 caracteres cobre-os. */
  reference: /Refer[êe]ncia[:\s]+([\d .]{15,25})/i,
  /** Valor em formato português: milhares por ponto, decimais por vírgula. */
  amount: /(?:Valor|Montante|Import[âa]ncia)[^\d]{0,20}([\d.]+,\d{2})/i,
  nif: /NIF[:\s]+(\d{9})/i,
  /** O período fica em bruto: canonizá-lo é trabalho do `parsePeriod`. */
  period: /Per[íi]odo[:\s]+([^\n]+)/i,
} as const;

function firstGroup(text: string, pattern: RegExp): string | null {
  const found = pattern.exec(text);
  const value = found?.[1]?.trim();
  return value === undefined || value === "" ? null : value;
}

export function parseFieldsFromText(text: string): RawPortalDocumentFields {
  const fields = {
    period: firstGroup(text, PATTERNS.period),
    entity: firstGroup(text, PATTERNS.entity),
    reference: firstGroup(text, PATTERNS.reference),
    amount: firstGroup(text, PATTERNS.amount),
    nif: firstGroup(text, PATTERNS.nif),
  };
  const found = Object.values(fields).some((value) => value !== null);
  return { ...fields, source: found ? "html" : "none" };
}
