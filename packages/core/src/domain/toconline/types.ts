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
