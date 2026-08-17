import { isValidNif } from "../validate-pt";
import type {
  CompanyScan,
  RawTocCompany,
  RejectedCompany,
  ScanWarning,
  ScannedCompany,
} from "./types";

/**
 * Converte o array cru do `vaadin-grid` em empresas validadas.
 *
 * **Total: nunca lança.** Quem chama é um job de RPA a olhar para dados de um
 * fornecedor que pode mudar o formato sem aviso; uma exceção a meio deixaria
 * metade da varredura por classificar. Cada linha é aceite, aceite-com-ressalva
 * ou descartada, e o resultado agregado é que decide se a varredura vale
 * (ver `assertScanIntegrity`, no worker).
 */

/** Aceita number ou string numérica — o grid nem sempre é consistente. */
function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function toCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeScan(rows: readonly RawTocCompany[]): CompanyScan {
  const companies: ScannedCompany[] = [];
  const warnings: ScanWarning[] = [];
  const rejected: RejectedCompany[] = [];
  const seenNifs = new Set<string>();

  for (const row of rows) {
    const source = (row ?? {}) as RawTocCompany;

    const tocCompanyId = toPositiveInt(source.id);
    if (tocCompanyId === null) {
      rejected.push({ tocCompanyId: null, reason: "id_invalido" });
      continue;
    }

    const name = toCleanString(source.name);
    if (!name) {
      rejected.push({ tocCompanyId, reason: "nome_ausente" });
      continue;
    }

    // NIF nulo não descarta a linha: a empresa é real e continua identificável
    // pelo `tocCompanyId`. Ver o comentário em ScannedCompany.nif.
    const digits = typeof source.tax_number === "string" ? source.tax_number.replace(/\D/g, "") : "";
    let nif: string | null = null;
    if (!digits) {
      warnings.push({ tocCompanyId, reason: "nif_ausente" });
    } else if (!isValidNif(digits)) {
      warnings.push({ tocCompanyId, reason: "nif_invalido" });
    } else if (seenNifs.has(digits)) {
      // Duas entidades distintas no TOConline com o mesmo NIF. Importamos ambas
      // (têm ids próprios), mas só a primeira fica com o NIF — `unique(team_id,
      // nif)` não admite as duas, e escolher em silêncio qual perde seria pior.
      warnings.push({ tocCompanyId, reason: "nif_duplicado" });
    } else {
      seenNifs.add(digits);
      nif = digits;
    }

    companies.push({
      tocCompanyId,
      nif,
      name,
      cluster: toPositiveInt(source.cluster) ?? 0,
      active: source.status === "active",
      demo: source.demo === true,
      accounting: source.accounting === true,
      roles: toCleanString(source.roles) || null,
    });
  }

  return { companies, warnings, rejected };
}

/**
 * Quais das empresas varridas entram na nossa base.
 *
 * Só as `demo` ficam de fora: são sandboxes do fornecedor, não clientes.
 * Inativas entram (com `status: inactive`) porque perder uma faria a carteira
 * parecer incompleta e uma reativação futura criaria duplicado. O módulo de
 * contabilidade também não exclui ninguém — a varredura não deita dados fora;
 * filtrar por módulo é decisão de quem consome.
 */
export function isPersistable(company: ScannedCompany): boolean {
  return !company.demo;
}

export function persistableCompanies(scan: CompanyScan): ScannedCompany[] {
  return scan.companies.filter(isPersistable);
}
