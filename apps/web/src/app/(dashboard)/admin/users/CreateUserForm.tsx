"use client";

import { useActionState } from "react";
import { createUser, type CreateUserState } from "./actions";

const initialState: CreateUserState = {};

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUser, initialState);

  return (
    <section
      style={{
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: 16,
        marginBottom: 24,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Cadastrar usuário</h2>
      <form action={formAction} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Email</span>
          <input name="email" type="email" required />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Nome completo</span>
          <input name="full_name" type="text" />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Papel</span>
          <select name="role" defaultValue="member">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "Cadastrando..." : "Cadastrar"}
        </button>
      </form>

      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}

      {state.ok && (
        <div
          role="status"
          style={{
            marginTop: 12,
            padding: 12,
            background: "#f0fff0",
            border: "1px solid #9c9",
            borderRadius: 6,
          }}
        >
          <p style={{ margin: "0 0 8px" }}>
            Usuário <strong>{state.email}</strong> criado. Envie a senha temporária
            abaixo (mostrada apenas uma vez):
          </p>
          <code style={{ fontSize: 18, userSelect: "all" }}>{state.tempPassword}</code>
        </div>
      )}
    </section>
  );
}
