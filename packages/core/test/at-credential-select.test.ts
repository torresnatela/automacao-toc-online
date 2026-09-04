import { describe, it, expect } from "vitest";
import { selectAccessCredential } from "../src/domain/at/credential";
import type { CredentialCandidate } from "../src/domain/at/credential";

const COMPANY = "company-1";

function candidate(over: Partial<CredentialCandidate> = {}): CredentialCandidate {
  return {
    id: "cred-1",
    provider: "toconline",
    companyId: null,
    status: "active",
    hasSecret: true,
    ...over,
  };
}

const tocTeam = candidate({ id: "toc-team", provider: "toconline" });
const atTeam = candidate({ id: "at-team", provider: "at" });
const atCompany = candidate({ id: "at-company", provider: "at", companyId: COMPANY });

describe("selectAccessCredential — rota A (Acesso Direto do TOConline)", () => {
  it("usa a credencial TOConline da equipa", () => {
    expect(selectAccessCredential("toconline_direct_access", COMPANY, [tocTeam, atTeam])).toEqual({
      ok: true,
      credentialId: "toc-team",
      scope: "team",
    });
  });

  it("sem credencial TOConline é toconline_credential_missing", () => {
    expect(selectAccessCredential("toconline_direct_access", COMPANY, [atTeam])).toEqual({
      ok: false,
      outcome: "toconline_credential_missing",
    });
    // Uma linha ativa mas sem segredo guardado não serve para entrar.
    expect(
      selectAccessCredential("toconline_direct_access", COMPANY, [
        candidate({ id: "toc-team", hasSecret: false }),
      ]),
    ).toEqual({ ok: false, outcome: "toconline_credential_missing" });
  });

  it("credencial TOConline invalid ou expired é toconline_credential_invalid", () => {
    for (const status of ["invalid", "expired"] as const) {
      expect(
        selectAccessCredential("toconline_direct_access", COMPANY, [
          candidate({ id: "toc-team", status, invalidReason: "login_rejeitado" }),
        ]),
        status,
      ).toEqual({
        ok: false,
        outcome: "toconline_credential_invalid",
        invalidReason: "login_rejeitado",
      });
    }
  });

  // Ignora a credencial da empresa de outro fornecedor.
  it("não confunde a credencial da empresa com a da equipa", () => {
    expect(
      selectAccessCredential("toconline_direct_access", COMPANY, [
        candidate({ id: "toc-company", companyId: COMPANY }),
      ]),
    ).toEqual({ ok: false, outcome: "toconline_credential_missing" });
  });
});

describe("selectAccessCredential — rota B (login direto na AT)", () => {
  it("prefere a credencial AT da empresa", () => {
    expect(selectAccessCredential("at_direct_login", COMPANY, [atTeam, atCompany])).toEqual({
      ok: true,
      credentialId: "at-company",
      scope: "company",
    });
  });

  it("sem credencial da empresa cai na da equipa", () => {
    expect(selectAccessCredential("at_direct_login", COMPANY, [tocTeam, atTeam])).toEqual({
      ok: true,
      credentialId: "at-team",
      scope: "team",
    });
  });

  it("nenhuma credencial AT é at_credential_missing", () => {
    expect(selectAccessCredential("at_direct_login", COMPANY, [tocTeam])).toEqual({
      ok: false,
      outcome: "at_credential_missing",
    });
    expect(selectAccessCredential("at_direct_login", COMPANY, [])).toEqual({
      ok: false,
      outcome: "at_credential_missing",
    });
  });

  it("credencial AT sem segredo guardado é at_credential_missing", () => {
    expect(
      selectAccessCredential("at_direct_login", COMPANY, [
        candidate({ id: "at-team", provider: "at", hasSecret: false }),
      ]),
    ).toEqual({ ok: false, outcome: "at_credential_missing" });
  });

  it("ignora a credencial AT de outra empresa", () => {
    expect(
      selectAccessCredential("at_direct_login", COMPANY, [
        candidate({ id: "at-outra", provider: "at", companyId: "company-2" }),
      ]),
    ).toEqual({ ok: false, outcome: "at_credential_missing" });
  });
});

describe("marcador AT da empresa inválido", () => {
  // O marcador é a linha sem segredo que regista o que o portal disse sobre a
  // senha da empresa. Se ele está inválido, tentar de novo só gasta tentativas.
  const marker = candidate({
    id: "at-marker",
    provider: "at",
    companyId: COMPANY,
    status: "invalid",
    hasSecret: false,
    invalidReason: "senha_bloqueada",
  });

  it("bloqueia a rota A mesmo com a credencial da equipa ativa", () => {
    expect(selectAccessCredential("toconline_direct_access", COMPANY, [tocTeam, marker])).toEqual({
      ok: false,
      outcome: "at_credential_invalid",
      invalidReason: "senha_bloqueada",
    });
  });

  it("bloqueia a rota B mesmo com a credencial AT da equipa ativa", () => {
    expect(selectAccessCredential("at_direct_login", COMPANY, [atTeam, marker])).toEqual({
      ok: false,
      outcome: "at_credential_invalid",
      invalidReason: "senha_bloqueada",
    });
  });

  it("também bloqueia quando está expired", () => {
    expect(
      selectAccessCredential("at_direct_login", COMPANY, [
        atTeam,
        candidate({
          id: "at-marker",
          provider: "at",
          companyId: COMPANY,
          status: "expired",
          hasSecret: false,
          invalidReason: "2fa_exigido",
        }),
      ]),
    ).toEqual({
      ok: false,
      outcome: "at_credential_invalid",
      invalidReason: "2fa_exigido",
    });
  });

  it("um marcador de outra empresa não bloqueia esta", () => {
    expect(
      selectAccessCredential("toconline_direct_access", COMPANY, [
        tocTeam,
        candidate({ provider: "at", companyId: "company-2", status: "invalid", hasSecret: false }),
      ]),
    ).toMatchObject({ ok: true });
  });
});
