import type { CompanyStatus } from "../types";

/**
 * Contrato da varredura de empresas do TOConline.
 *
 * O TOConline não tem API: a lista vem do array `items` de um `vaadin-grid`,
 * lido pelo worker dentro do browser. Estes tipos são a fronteira entre esse
 * mundo (frágil, do fornecedor) e o nosso domínio — e são puros de propósito:
 * é aqui que vivem as decisões, e decisões testam-se sem browser.
 */

/**
 * Uma linha do grid tal como sai do browser: **nada aqui é de confiança**.
 * Os campos são `unknown` porque o formato é do fornecedor e pode mudar sem
 * aviso — a validação é o trabalho de `normalizeScan`.
 */
export interface RawTocCompany {
  id: unknown;
  tax_number: unknown;
  name: unknown;
  cluster: unknown;
  status: unknown;
  /**
   * Rótulo localizado do estado ("Ativa"). Não é usado na normalização — está
   * aqui para diagnóstico: se `status` for renomeado mas este continuar a
   * chegar, sabe-se logo que o contrato mudou e não que a conta ficou vazia.
   */
  i18n_status: unknown;
  demo: unknown;
  accounting: unknown;
  roles: unknown;
}

/** Empresa lida do TOConline, validada. É isto que atravessa para a persistência. */
export interface ScannedCompany {
  /** `id` interno do TOConline (6 dígitos). Com `cluster`, é a referência de acesso direto. */
  tocCompanyId: number;
  /**
   * NIF de 9 dígitos com dígito de controlo válido, ou `null`.
   *
   * Nulo em vez de rejeitar a linha: perder um cliente real por um checksum
   * (entidade estrangeira, registo antigo) é pior que importá-lo sem NIF. A
   * deduplicação dessas empresas passa a ser só por `tocCompanyId`, que é
   * estável e igualmente único por equipa.
   */
  nif: string | null;
  name: string;
  /** Shard do servidor TOConline onde a empresa vive (app1, app5, app11…). */
  cluster: number;
  active: boolean;
  demo: boolean;
  accounting: boolean;
  roles: string | null;
}

/** Linha importada, mas com uma ressalva que vale a pena registar. */
export type ScanWarningReason = "nif_ausente" | "nif_invalido" | "nif_duplicado";

/** Linha que não dá sequer para importar. */
export type RejectReason = "id_invalido" | "nome_ausente";

/**
 * Ressalva/descarte. Só identificadores do sistema de origem — **nunca nome
 * nem NIF**: isto acaba em `events.payload`, e 182 nomes+NIFs de clientes
 * (incluindo empresários em nome individual, ou seja, pessoas singulares) não
 * podem viver na observabilidade.
 */
export interface ScanWarning {
  tocCompanyId: number;
  reason: ScanWarningReason;
}

export interface RejectedCompany {
  tocCompanyId: number | null;
  reason: RejectReason;
}

export interface CompanyScan {
  companies: ScannedCompany[];
  warnings: ScanWarning[];
  rejected: RejectedCompany[];
}

// ---------------------------------------------------------------------------
// Reconciliação
// ---------------------------------------------------------------------------

/** Projeção mínima de uma empresa já existente **na equipa que está a ser varrida**. */
export interface ExistingCompany {
  id: string;
  nif: string | null;
  name: string;
  status: CompanyStatus;
  tocCompanyId: number | null;
  tocCluster: number | null;
}

/** Campos que a varredura pode escrever. Todos os outros são do operador. */
export interface CompanyTocPatch {
  name?: string;
  nif?: string | null;
  status?: CompanyStatus;
  tocCompanyId?: number;
  tocCluster?: number;
}

export type ReconcileAction =
  /** Não existe cá: criar. `niss` e `type` ficam nulos — o TOConline não os informa. */
  | { kind: "create"; entry: ScannedCompany }
  /** Existia criada à mão e casou por NIF: adotar, preenchendo a referência TOConline. */
  | { kind: "link"; companyId: string; entry: ScannedCompany; changes: CompanyTocPatch }
  /** Já ligada, com algo diferente. */
  | { kind: "update"; companyId: string; entry: ScannedCompany; changes: CompanyTocPatch }
  | { kind: "unchanged"; companyId: string; entry: ScannedCompany }
  /** Empresa demo do TOConline: sandbox do fornecedor, não é cliente. */
  | { kind: "skip"; entry: ScannedCompany; reason: "demo" }
  /**
   * O NIF casa uma empresa que já está ligada a **outro** `tocCompanyId`.
   * Ambiguidade humana — nunca resolver sozinho.
   */
  | { kind: "conflict"; companyId: string; entry: ScannedCompany; reason: "nif_ligado_a_outra" }
  /**
   * Estava ligada ao TOConline e não apareceu nesta varredura. **Nunca apagar**:
   * `companies` cascateia para `obligations → obligation_periods → documents`,
   * e sumir do TOConline não pode apagar histórico fiscal.
   */
  | { kind: "missing"; companyId: string };

export interface ReconcileSummary {
  total: number;
  create: number;
  link: number;
  update: number;
  unchanged: number;
  skip: number;
  conflict: number;
  missing: number;
}

export interface ReconcilePlan {
  actions: ReconcileAction[];
  summary: ReconcileSummary;
}

// ---------------------------------------------------------------------------
// Contrato do job de varredura (dashboard ⇄ worker)
// ---------------------------------------------------------------------------

/**
 * Tipo do job que o dashboard enfileira e o worker consome.
 *
 * Vive aqui e não em cada lado porque os dois processos são *deployables*
 * distintos — o dashboard na Vercel, o worker fora dela. Duas cópias da string
 * divergem sem que nada falhe: o dashboard enfileira, o worker nunca reclama, e
 * o job fica pendente para sempre.
 */
export const SCAN_JOB_TYPE = "rpa.scan_companies";

/**
 * Contagens da varredura, na ordem em que o dashboard as apresenta.
 *
 * `jobs.result` é `jsonb`: **nada no typecheck liga o que o worker escreve ao
 * que a página lê**. Foi assim que as duas pontas divergiram (`created` vs
 * `create`) sem nenhum erro — a varredura corria bem e o resumo aparecia vazio.
 * Declarar as chaves uma só vez transforma essa divergência em erro de
 * compilação nos dois lados.
 */
export const SCAN_COUNT_KEYS = [
  "scanned",
  "created",
  "linked",
  "updated",
  "unchanged",
  "skipped",
  "conflicts",
  "missing",
  "rejected",
  "persisted",
] as const;

export type ScanCountKey = (typeof SCAN_COUNT_KEYS)[number];

/** O que o worker grava em `jobs.result` e a página lê de volta. */
export type ScanJobResult = Record<ScanCountKey, number> & {
  /** Host shardado onde a varredura correu (`app5.toconline.pt`). */
  host: string;
  /** Propriedade do grid de onde saíram as linhas — diagnóstico. */
  via: string;
};
