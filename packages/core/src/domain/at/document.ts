/**
 * Campos de pagamento da guia do IVA (entidade · referência · valor).
 *
 * **Total: nunca lança.** Quem chama é um job de RPA a ler um PDF/HTML da AT
 * que pode mudar de formato sem aviso; uma exceção a meio deixaria a guia já
 * descarregada por classificar. Cada campo é lido ou fica `null` com uma
 * ressalva — o desfecho `fetched_without_fields` existe precisamente para o
 * caso de o PDF estar bom e os campos ilegíveis.
 *
 * **RGPD**: as ressalvas são *códigos*, nunca o valor lido. O que sai daqui vai
 * parar a `jobs.result` e aos eventos.
 */

/** O que o adaptador leu da página/PDF, tal como veio. */
export interface RawDocumentFields {
  entity: unknown;
  reference: unknown;
  amount: unknown;
  /** NIF impresso no documento — só serve à guarda `taxIdMatches`. */
  taxId?: unknown;
}

export type DocumentFieldWarning =
  | "entidade_ausente"
  | "entidade_invalida"
  | "referencia_ausente"
  | "referencia_invalida"
  | "valor_ausente"
  | "valor_invalido";

export interface NormalizedDocumentFields {
  /** 5 dígitos. */
  entity: string | null;
  /** 15 dígitos. */
  reference: string | null;
  /** Decimal com 2 casas e ponto como separador (`"1234.56"`) — pronto para `numeric`. */
  amount: string | null;
  warnings: DocumentFieldWarning[];
}

/**
 * Texto utilizável do campo, ou `null` quando o campo simplesmente não veio.
 *
 * "Não veio" (ausente) e "veio ilegível" (inválido) são ressalvas diferentes
 * porque pedem ações diferentes ao operador.
 */
function presentText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function digitsOnly(text: string): string {
  return text.replace(/\D/g, "");
}

/**
 * Converte o valor monetário para decimal com ponto.
 *
 * Aceita `1.234,56 €` (PT), `1234,56`, `1234.56` e números. Quando aparecem os
 * dois separadores, o da direita é o decimal. Só com pontos, `1.234` é milhar
 * (grupos de 3) e `1234.56` é decimal.
 */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[\s€]/g, "");
  if (cleaned === "") return null;

  let normalized: string;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function normalizeDocumentFields(raw: RawDocumentFields): NormalizedDocumentFields {
  const source = raw ?? ({} as RawDocumentFields);
  const warnings: DocumentFieldWarning[] = [];

  let entity: string | null = null;
  const entityText = presentText(source.entity);
  if (entityText === null) {
    warnings.push("entidade_ausente");
  } else {
    const digits = digitsOnly(entityText);
    if (/^\d{5}$/.test(digits)) entity = digits;
    else warnings.push("entidade_invalida");
  }

  let reference: string | null = null;
  const referenceText = presentText(source.reference);
  if (referenceText === null) {
    warnings.push("referencia_ausente");
  } else {
    // Só espaços e pontos são separadores tipográficos; o resto invalida.
    const compact = referenceText.replace(/[\s.]/g, "");
    if (/^\d{15}$/.test(compact)) reference = compact;
    else warnings.push("referencia_invalida");
  }

  let amount: string | null = null;
  const amountText = presentText(source.amount);
  if (amountText === null) {
    warnings.push("valor_ausente");
  } else {
    const value = parseAmount(amountText);
    // Uma guia de pagamento nunca é ≤ 0 (IVA a recuperar não gera documento) e
    // acima de 12 dígitos inteiros é leitura corrompida, não um valor.
    const integerDigits = value === null ? 0 : Math.trunc(Math.abs(value)).toString().length;
    if (value === null || value <= 0 || integerDigits > 12) warnings.push("valor_invalido");
    else amount = value.toFixed(2);
  }

  return { entity, reference, amount, warnings };
}

/** Os três campos presentes — é isto que separa `fetched` de `fetched_without_fields`. */
export function documentFieldsComplete(f: NormalizedDocumentFields): boolean {
  return f.entity !== null && f.reference !== null && f.amount !== null;
}

/**
 * Guarda: o NIF impresso no documento é o da empresa?
 *
 * `null` = ilegível (não se pode afirmar nada); é o chamador que decide se um
 * campo ilegível vale ressalva ou bloqueio. Compara só dígitos porque o portal
 * imprime o NIF com espaços.
 */
export function taxIdMatches(raw: unknown, companyNif: string): boolean | null {
  const text = presentText(raw);
  if (text === null) return null;
  const fromDocument = digitsOnly(text);
  const expected = digitsOnly(companyNif ?? "");
  if (fromDocument === "" || expected === "") return null;
  return fromDocument === expected;
}
