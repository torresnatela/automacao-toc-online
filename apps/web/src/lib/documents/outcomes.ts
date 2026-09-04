import { IVA_OUTCOMES, type IvaOutcome, type IvaSeverity } from "@toc/core/domain";
import type { BadgeProps } from "@/components/ui/badge";

/**
 * Estado de uma linha da listagem de guias de IVA → o que o crachá mostra.
 *
 * Este ficheiro traduz domínio em interface e **nada mais**: os rótulos e as
 * orientações vivem em `@toc/core/domain` (são conhecimento de domínio,
 * reutilizável pelo envio ao cliente que há de vir) e daqui só sai o mapeamento
 * para tons do design system. Duplicar um rótulo aqui seria criar uma segunda
 * verdade que ninguém se lembraria de atualizar.
 */

/**
 * Só um `import type` do componente: em compilação amarra os tons aos que o
 * `Badge` sabe pintar, em execução é apagado — por isso este módulo continua
 * puro e testável sem React nem DOM.
 */
export type BadgeTone = NonNullable<BadgeProps["tone"]>;

/**
 * O que a linha mostra: um desfecho do worker, ou um dos quatro estados que só
 * a interface conhece (o job ainda não produziu desfecho nenhum).
 */
export type IvaRowState = IvaOutcome | (typeof UI_STATES)[number];

/**
 * Estados sem desfecho. `failed_unknown` não é `unknown_error`: aquele é um
 * desfecho que o worker escreveu, este é a linha cujo código não reconhecemos
 * (job antigo, `last_error` sem `outcome`) — e a diferença importa porque só o
 * primeiro tem orientação de domínio.
 */
export const UI_STATES = ["queued", "running", "never", "failed_unknown"] as const;

export type UiState = (typeof UI_STATES)[number];

/** Severidade do domínio → tom do crachá. A cor não é decisão do domínio. */
export const SEVERITY_TONE: Record<IvaSeverity, BadgeTone> = {
  ok: "success",
  wait: "info",
  action: "destructive",
  support: "warning",
};

/** A instrução de uma linha, quando não há orientação específica a mostrar. */
const SEVERITY_SHORT: Record<IvaSeverity, string> = {
  ok: "Nada a fazer",
  wait: "Aguardar / tentar mais tarde",
  action: "Ação necessária",
  support: "Contacte o suporte",
};

export interface RowStateMeta {
  /** PT-PT curto, para o crachá. */
  label: string;
  tone: BadgeTone;
  /** Uma linha por baixo do crachá — o que fazer, em telegrama. */
  short: string;
}

export const UI_STATE_META: Record<UiState, RowStateMeta> = {
  queued: { label: "Na fila", tone: "brand", short: "Aguarda o worker" },
  running: { label: "A obter…", tone: "brand", short: "O worker está no portal" },
  never: { label: "Nunca buscada", tone: "neutral", short: "Clique em Buscar" },
  failed_unknown: {
    label: "Falhou",
    tone: "destructive",
    short: "Erro inesperado — veja o trace",
  },
};

/**
 * `Record` → `Record` com as mesmas chaves.
 *
 * O `as` está confinado aqui (a construção incremental de um objeto completo
 * não é exprimível em TS) para que os mapas exportados abaixo possam ser
 * anotados `Record<IvaRowState, …>` e a completude passe a ser verificada pelo
 * compilador em vez de por uma asserção no fim.
 */
function mapRecord<K extends string, A, B>(
  source: Record<K, A>,
  transform: (value: A, key: K) => B,
): Record<K, B> {
  const out = {} as Record<K, B>;
  for (const key of Object.keys(source) as K[]) out[key] = transform(source[key], key);
  return out;
}

/**
 * A anotação é a rede: se `IvaOutcome` ganhar um código ou `UI_STATES` um
 * estado, o `Record<IvaRowState, RowStateMeta>` deixa de estar completo e isto
 * não compila. (`outcomes.test.ts` repete a verificação em execução, para o
 * caso de o código novo chegar sem recompilação.)
 */
const ROW_STATE_META: Record<IvaRowState, RowStateMeta> = {
  ...mapRecord(IVA_OUTCOMES, (spec) => ({
    label: spec.label,
    tone: SEVERITY_TONE[spec.severity],
    short: SEVERITY_SHORT[spec.severity],
  })),
  ...UI_STATE_META,
};

export function rowStateMeta(state: IvaRowState): RowStateMeta {
  return ROW_STATE_META[state];
}

/** Tons por estado, na forma que o `StatusBadge` consome (`kind="ivaDocument"`). */
export const IVA_ROW_TONES: Record<IvaRowState, BadgeTone> = mapRecord(
  ROW_STATE_META,
  (meta) => meta.tone,
);
