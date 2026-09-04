import { describe, it, expect } from "vitest";
import { IVA_OUTCOMES, IVA_STAGES } from "@toc/core/domain";
import type { IvaStage } from "@toc/core/domain";
import {
  AtAuthError,
  AtIntegrityError,
  AtTransientError,
  InvalidCredentialsError,
  StructuralError,
} from "../../src/errors";
import { classifyFailure } from "../../src/runner/classify-failure";

/**
 * A regra única: `retry = !(err instanceof StructuralError)`.
 *
 * O teste corre-a contra **cada classe de erro × cada etapa** porque é a única
 * salvaguarda automática contra o pior cenário do Módulo 1: retentar uma senha
 * que a AT já recusou gasta o contador da conta e bloqueia-a por dias. Um
 * `instanceof` esquecido numa etapa nova morre aqui, não em produção.
 */

/** Erro genérico com o `name` que o Playwright dá aos seus timeouts. */
function timeoutDoPlaywright(): Error {
  const err = new Error("Timeout 30000ms exceeded.");
  err.name = "TimeoutError";
  return err;
}

const CLASSES: { nome: string; criar: () => unknown }[] = [
  { nome: "AtAuthError(rejected)", criar: () => new AtAuthError("rejected", 2) },
  { nome: "AtAuthError(blocked)", criar: () => new AtAuthError("blocked") },
  { nome: "AtAuthError(expired)", criar: () => new AtAuthError("expired") },
  { nome: "AtAuthError(two_factor)", criar: () => new AtAuthError("two_factor") },
  {
    nome: "AtAuthError(authorization_missing)",
    criar: () => new AtAuthError("authorization_missing"),
  },
  {
    nome: "AtIntegrityError(at_session_mismatch)",
    criar: () => new AtIntegrityError("at_session_mismatch", "Sessão de outro contribuinte."),
  },
  {
    nome: "AtIntegrityError(document_type_unexpected)",
    criar: () => new AtIntegrityError("document_type_unexpected", "Documento inesperado."),
  },
  {
    nome: "AtIntegrityError(document_fields_mismatch)",
    criar: () => new AtIntegrityError("document_fields_mismatch", "Guia de outra empresa."),
  },
  {
    nome: "AtIntegrityError(direct_access_extension_missing)",
    criar: () => new AtIntegrityError("direct_access_extension_missing", "Extensão em falta."),
  },
  {
    nome: "AtIntegrityError(at_unexpected_page)",
    criar: () => new AtIntegrityError("at_unexpected_page", "Página irreconhecível."),
  },
  {
    nome: "AtIntegrityError(toconline_unexpected_page)",
    criar: () => new AtIntegrityError("toconline_unexpected_page", "Página irreconhecível."),
  },
  {
    nome: "AtTransientError(at_unavailable)",
    criar: () => new AtTransientError("at_unavailable", "O Portal das Finanças não respondeu."),
  },
  {
    nome: "AtTransientError(toconline_unavailable)",
    criar: () => new AtTransientError("toconline_unavailable", "O TOConline não respondeu."),
  },
  {
    nome: "AtTransientError(direct_access_failed)",
    criar: () => new AtTransientError("direct_access_failed", "O acesso direto falhou."),
  },
  {
    nome: "AtTransientError(document_capture_failed)",
    criar: () => new AtTransientError("document_capture_failed", "Falha ao descarregar a guia."),
  },
  {
    nome: "AtTransientError(persist_failed)",
    criar: () => new AtTransientError("persist_failed", "Falha ao guardar."),
  },
  { nome: "InvalidCredentialsError", criar: () => new InvalidCredentialsError() },
  { nome: "StructuralError genérico", criar: () => new StructuralError("página irreconhecível") },
  { nome: "Error genérico", criar: () => new Error("boom") },
  { nome: "TimeoutError do Playwright", criar: timeoutDoPlaywright },
  { nome: "valor lançado que não é Error", criar: () => "isto não é um Error" },
];

/**
 * A única célula onde o código escolhido e a tabela discordam do `retry`.
 *
 * Um `StructuralError` na persistência (ex.: bucket inexistente, 4xx do
 * Storage) não tem código próprio na taxonomia: cai em `unknown_error`, que a
 * tabela declara retentável por ser, no caso comum, um transitório. Aqui a
 * regra única manda e o job não é retentado. Ver o teste dedicado abaixo.
 */
function divergeDaTabela(nome: string, stage: IvaStage): boolean {
  return nome === "StructuralError genérico" && stage === "persist";
}

describe("classifyFailure — a regra única, classe a classe e etapa a etapa", () => {
  for (const { nome, criar } of CLASSES) {
    for (const stage of IVA_STAGES) {
      it(`${nome} × ${stage}`, () => {
        const err = criar();
        const { outcome, retry, details } = classifyFailure(err, stage);

        expect(retry).toBe(!(err instanceof StructuralError));
        // Nunca se retenta mais do que a taxonomia permite (só menos).
        if (retry) expect(IVA_OUTCOMES[outcome].retry).toBe(true);
        if (!divergeDaTabela(nome, stage)) expect(retry).toBe(IVA_OUTCOMES[outcome].retry);
        expect(details.stage).toBe(stage);
      });
    }
  }
});

describe("classifyFailure — erros com código próprio", () => {
  it("AtAuthError traduz o motivo em código e leva as tentativas restantes", () => {
    expect(classifyFailure(new AtAuthError("rejected", 2), "at_login")).toEqual({
      outcome: "at_login_rejected",
      retry: false,
      details: { stage: "at_login", attemptsLeft: 2 },
    });
    expect(classifyFailure(new AtAuthError("blocked"), "at_login").outcome).toBe(
      "at_password_blocked",
    );
    expect(classifyFailure(new AtAuthError("expired"), "at_login").outcome).toBe(
      "at_password_expired",
    );
    expect(classifyFailure(new AtAuthError("two_factor"), "at_login").outcome).toBe(
      "at_2fa_required",
    );
    expect(classifyFailure(new AtAuthError("authorization_missing"), "at_login").outcome).toBe(
      "at_authorization_missing",
    );
  });

  it("sem tentativas restantes, `attemptsLeft` não entra nos detalhes", () => {
    expect(classifyFailure(new AtAuthError("rejected"), "at_login").details).toEqual({
      stage: "at_login",
    });
  });

  it("AtIntegrityError e AtTransientError trazem o próprio código", () => {
    expect(
      classifyFailure(new AtIntegrityError("at_session_mismatch", "x"), "at_document").outcome,
    ).toBe("at_session_mismatch");
    expect(classifyFailure(new AtTransientError("at_unavailable", "x"), "at_login").outcome).toBe(
      "at_unavailable",
    );
  });

  it("InvalidCredentialsError → toconline_login_rejected", () => {
    expect(classifyFailure(new InvalidCredentialsError(), "toconline").outcome).toBe(
      "toconline_login_rejected",
    );
  });
});

describe("classifyFailure — erros sem código, decididos pela etapa", () => {
  const estrutural = () => new StructuralError("página irreconhecível");

  it("estrutural → página inesperada do portal onde a etapa acontece", () => {
    expect(classifyFailure(estrutural(), "toconline").outcome).toBe("toconline_unexpected_page");
    expect(classifyFailure(estrutural(), "direct_access").outcome).toBe(
      "toconline_unexpected_page",
    );
    expect(classifyFailure(estrutural(), "at_login").outcome).toBe("at_unexpected_page");
    expect(classifyFailure(estrutural(), "at_declaration").outcome).toBe("at_unexpected_page");
    expect(classifyFailure(estrutural(), "at_document").outcome).toBe("at_unexpected_page");
    expect(classifyFailure(estrutural(), "precondition").outcome).toBe("payload_invalid");
  });

  // `persist_failed` é retentável; um erro estrutural nunca é. Prevalece a regra.
  it("estrutural em persist → unknown_error sem retry, nunca persist_failed", () => {
    const { outcome, retry } = classifyFailure(estrutural(), "persist");
    expect(outcome).toBe("unknown_error");
    expect(retry).toBe(false);
  });

  it("transitório → indisponibilidade do portal da etapa", () => {
    expect(classifyFailure(new Error("boom"), "toconline").outcome).toBe("toconline_unavailable");
    expect(classifyFailure(new Error("boom"), "direct_access").outcome).toBe(
      "toconline_unavailable",
    );
    expect(classifyFailure(timeoutDoPlaywright(), "at_login").outcome).toBe("at_unavailable");
    expect(classifyFailure(timeoutDoPlaywright(), "at_declaration").outcome).toBe("at_unavailable");
    expect(classifyFailure(timeoutDoPlaywright(), "at_document").outcome).toBe("at_unavailable");
    expect(classifyFailure(new Error("boom"), "persist").outcome).toBe("persist_failed");
    expect(classifyFailure(new Error("boom"), "precondition").outcome).toBe("unknown_error");
  });

  it("valor lançado que não é Error → unknown_error retentável", () => {
    expect(classifyFailure("isto não é um Error", "at_document")).toEqual({
      outcome: "unknown_error",
      retry: true,
      details: { stage: "at_document" },
    });
  });
});
