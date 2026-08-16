import type { CompanyStatus } from "../types";
import { isPersistable } from "./normalize";
import type {
  CompanyTocPatch,
  ExistingCompany,
  ReconcileAction,
  ReconcilePlan,
  ReconcileSummary,
  ScannedCompany,
} from "./types";

/**
 * Decide o que fazer com cada empresa varrida do TOConline.
 *
 * Pura e determinística: `existing` já vem escopado à equipa, e o resultado é
 * um **plano** — nada é escrito aqui. Separar a decisão da escrita é o que
 * permite cobrir 182 empresas e todos os casos-limite em milissegundos, sem
 * browser, sem rede e sem base de dados; ao executor sobra aplicar.
 *
 * A ordem de correspondência é deliberada: **id do TOConline primeiro, NIF
 * depois.** O id é a identidade estável do lado deles; o NIF é uma ponte para
 * adotar o que já foi cadastrado à mão antes desta integração existir.
 */

/** Só os campos que a varredura tem autoridade para escrever. */
function diff(entry: ScannedCompany, current: ExistingCompany): CompanyTocPatch {
  const changes: CompanyTocPatch = {};
  const status: CompanyStatus = entry.active ? "active" : "inactive";

  if (entry.name !== current.name) changes.name = entry.name;
  // NIF nulo na varredura não apaga o que já lá está: pode ter sido preenchido
  // à mão, e o TOConline não é autoridade sobre um dado que não forneceu.
  if (entry.nif !== null && entry.nif !== current.nif) changes.nif = entry.nif;
  if (status !== current.status) changes.status = status;
  if (entry.cluster !== current.tocCluster) changes.tocCluster = entry.cluster;

  return changes;
}

function emptySummary(total: number): ReconcileSummary {
  return { total, create: 0, link: 0, update: 0, unchanged: 0, skip: 0, conflict: 0, missing: 0 };
}

export function planCompanyReconciliation(
  entries: readonly ScannedCompany[],
  existing: readonly ExistingCompany[],
): ReconcilePlan {
  const byTocId = new Map<number, ExistingCompany>();
  const byNif = new Map<string, ExistingCompany>();
  for (const company of existing) {
    if (company.tocCompanyId !== null) byTocId.set(company.tocCompanyId, company);
    if (company.nif) byNif.set(company.nif, company);
  }

  const actions: ReconcileAction[] = [];
  /** Empresas locais que a varredura viu — as restantes ligadas ficam `missing`. */
  const seen = new Set<string>();

  for (const entry of entries) {
    const linked = byTocId.get(entry.tocCompanyId);

    if (!isPersistable(entry)) {
      // Uma demo continua a ser "vista": se já estiver ligada cá, não pode
      // passar por desaparecida só porque a ignorámos.
      if (linked) seen.add(linked.id);
      actions.push({ kind: "skip", entry, reason: "demo" });
      continue;
    }

    if (linked) {
      seen.add(linked.id);
      const changes = diff(entry, linked);
      actions.push(
        Object.keys(changes).length === 0
          ? { kind: "unchanged", companyId: linked.id, entry }
          : { kind: "update", companyId: linked.id, entry, changes },
      );
      continue;
    }

    const byNifMatch = entry.nif ? byNif.get(entry.nif) : undefined;
    if (byNifMatch) {
      seen.add(byNifMatch.id);

      if (byNifMatch.tocCompanyId !== null) {
        // O mesmo NIF a apontar para duas entidades distintas do TOConline.
        // É ambiguidade humana (registo duplicado, fusão, engano de cadastro);
        // escolher em silêncio seria escolher errado metade das vezes.
        actions.push({ kind: "conflict", companyId: byNifMatch.id, entry, reason: "nif_ligado_a_outra" });
        continue;
      }

      actions.push({
        kind: "link",
        companyId: byNifMatch.id,
        entry,
        changes: {
          ...diff(entry, byNifMatch),
          tocCompanyId: entry.tocCompanyId,
          tocCluster: entry.cluster,
        },
      });
      continue;
    }

    actions.push({ kind: "create", entry });
  }

  // Ligadas ao TOConline que não apareceram. Nunca apagar: `companies`
  // cascateia para obligations → obligation_periods → documents, e sumir do
  // portal do fornecedor não pode apagar histórico fiscal nosso.
  for (const company of existing) {
    if (company.tocCompanyId !== null && !seen.has(company.id)) {
      actions.push({ kind: "missing", companyId: company.id });
    }
  }

  const summary = actions.reduce((acc, action) => {
    acc[action.kind] += 1;
    return acc;
  }, emptySummary(entries.length));

  return { actions, summary };
}
