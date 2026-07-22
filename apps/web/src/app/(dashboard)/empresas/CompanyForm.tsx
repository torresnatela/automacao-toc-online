"use client";

import { useActionState } from "react";
import { CONTRIBUTOR_TYPES, COMPANY_STATUSES } from "@toc/core/domain";
import { CONTRIBUTOR_TYPE_LABELS, COMPANY_STATUS_LABELS, labelOf } from "@/lib/labels";
import type { CompanyRow } from "@/lib/companies/service";
import type { CompanyFormState } from "./actions";

const labelStyle = { display: "grid", gap: 4 } as const;
const errStyle = { color: "crimson", fontSize: 13 } as const;

export interface CompanyFormProps {
  action: (prev: CompanyFormState, formData: FormData) => Promise<CompanyFormState>;
  teams: { id: string; name: string }[];
  isAdmin: boolean;
  defaultTeamId: string | null;
  initial?: CompanyRow | null;
  title: string;
  submitLabel: string;
}

export function CompanyForm({
  action,
  teams,
  isAdmin,
  defaultTeamId,
  initial,
  title,
  submitLabel,
}: CompanyFormProps) {
  const [state, formAction, pending] = useActionState<CompanyFormState, FormData>(action, {});
  const fe = state.fieldErrors ?? {};
  // Liga o input ao seu erro para leitores de tela (aria-invalid + aria-describedby).
  const aria = (key: keyof typeof fe) =>
    fe[key] ? { "aria-invalid": true as const, "aria-describedby": `company-err-${key}` } : {};

  return (
    <section style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <form action={formAction} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        {isAdmin && (
          <label style={labelStyle}>
            <span>Equipe</span>
            <select
              name="teamId"
              defaultValue={initial?.team_id ?? defaultTeamId ?? ""}
              required
              {...aria("teamId")}
            >
              <option value="" disabled>
                — selecione —
              </option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {fe.teamId && (
              <span id="company-err-teamId" style={errStyle}>
                {fe.teamId}
              </span>
            )}
          </label>
        )}

        <label style={labelStyle}>
          <span>NISS</span>
          <input
            name="niss"
            inputMode="numeric"
            defaultValue={initial ? String(initial.niss) : ""}
            required
            {...aria("niss")}
          />
          {fe.niss && (
            <span id="company-err-niss" style={errStyle}>
              {fe.niss}
            </span>
          )}
        </label>

        <label style={labelStyle}>
          <span>NIF</span>
          <input name="nif" defaultValue={initial?.nif ?? ""} {...aria("nif")} />
          {fe.nif && (
            <span id="company-err-nif" style={errStyle}>
              {fe.nif}
            </span>
          )}
        </label>

        <label style={labelStyle}>
          <span>Nome</span>
          <input name="name" defaultValue={initial?.name ?? ""} required {...aria("name")} />
          {fe.name && (
            <span id="company-err-name" style={errStyle}>
              {fe.name}
            </span>
          )}
        </label>

        <label style={labelStyle}>
          <span>Tipo de contribuinte</span>
          <select name="type" defaultValue={initial?.type ?? "employer"} {...aria("type")}>
            {CONTRIBUTOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {labelOf(CONTRIBUTOR_TYPE_LABELS, t)}
              </option>
            ))}
          </select>
          {fe.type && (
            <span id="company-err-type" style={errStyle}>
              {fe.type}
            </span>
          )}
        </label>

        <label style={labelStyle}>
          <span>Status</span>
          <select name="status" defaultValue={initial?.status ?? "active"}>
            {COMPANY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {labelOf(COMPANY_STATUS_LABELS, s)}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          <span>Email</span>
          <input name="email" type="email" defaultValue={initial?.email ?? ""} {...aria("email")} />
          {fe.email && (
            <span id="company-err-email" style={errStyle}>
              {fe.email}
            </span>
          )}
        </label>

        <label style={labelStyle}>
          <span>Telefone</span>
          <input name="phone" defaultValue={initial?.phone ?? ""} />
        </label>

        <label style={labelStyle}>
          <span>Morada (linha 1)</span>
          <input name="addressLine1" defaultValue={initial?.address_line1 ?? ""} />
        </label>

        <label style={labelStyle}>
          <span>Morada (linha 2)</span>
          <input name="addressLine2" defaultValue={initial?.address_line2 ?? ""} />
        </label>

        <label style={labelStyle}>
          <span>Código postal</span>
          <input
            name="postalCode"
            placeholder="1049-013"
            defaultValue={initial?.postal_code ?? ""}
            {...aria("postalCode")}
          />
          {fe.postalCode && (
            <span id="company-err-postalCode" style={errStyle}>
              {fe.postalCode}
            </span>
          )}
        </label>

        <label style={labelStyle}>
          <span>Cidade</span>
          <input name="city" defaultValue={initial?.city ?? ""} />
        </label>

        <label style={labelStyle}>
          <span>País</span>
          <input name="country" maxLength={2} defaultValue={initial?.country ?? "PT"} {...aria("country")} />
          {fe.country && (
            <span id="company-err-country" style={errStyle}>
              {fe.country}
            </span>
          )}
        </label>

        <label style={labelStyle}>
          <span>Notas</span>
          <textarea name="notes" rows={3} defaultValue={initial?.notes ?? ""} />
        </label>

        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : submitLabel}
        </button>
      </form>

      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" style={{ color: "#2a7" }}>
          Empresa salva com sucesso.
        </p>
      )}
    </section>
  );
}
