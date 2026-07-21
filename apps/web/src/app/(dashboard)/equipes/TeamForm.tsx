"use client";

import { useActionState } from "react";
import { TEAM_STATUSES } from "@toc/core/domain";
import { TEAM_STATUS_LABELS, labelOf } from "@/lib/labels";
import type { TeamRow } from "@/lib/teams/service";
import type { TeamFormState } from "./actions";

const labelStyle = { display: "grid", gap: 4 } as const;
const errStyle = { color: "crimson", fontSize: 13 } as const;

export interface TeamFormProps {
  action: (prev: TeamFormState, formData: FormData) => Promise<TeamFormState>;
  initial?: TeamRow | null;
  title: string;
  submitLabel: string;
}

export function TeamForm({ action, initial, title, submitLabel }: TeamFormProps) {
  const [state, formAction, pending] = useActionState<TeamFormState, FormData>(action, {});
  const fe = state.fieldErrors ?? {};

  return (
    <section style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <form action={formAction} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label style={labelStyle}>
          <span>Nome do gabinete</span>
          <input name="name" defaultValue={initial?.name ?? ""} required />
          {fe.name && <span style={errStyle}>{fe.name}</span>}
        </label>

        <label style={labelStyle}>
          <span>NIF</span>
          <input name="nif" defaultValue={initial?.nif ?? ""} />
          {fe.nif && <span style={errStyle}>{fe.nif}</span>}
        </label>

        <label style={labelStyle}>
          <span>Status</span>
          <select name="status" defaultValue={initial?.status ?? "active"}>
            {TEAM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {labelOf(TEAM_STATUS_LABELS, s)}
              </option>
            ))}
          </select>
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
          Equipe salva com sucesso.
        </p>
      )}
    </section>
  );
}
