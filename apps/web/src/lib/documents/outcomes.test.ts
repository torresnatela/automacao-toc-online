import { describe, it, expect } from "vitest";
import { IVA_OUTCOME_CODES, IVA_OUTCOMES } from "@toc/core/domain";
import {
  IVA_ROW_TONES,
  SEVERITY_TONE,
  UI_STATES,
  UI_STATE_META,
  rowStateMeta,
  type IvaRowState,
} from "@/lib/documents/outcomes";

describe("IVA_ROW_TONES", () => {
  /**
   * A rede contra a divergência silenciosa: o `Record<IvaRowState, …>` já obriga
   * a completar o mapa em compilação, mas um código novo em `@toc/core` só é
   * apanhado por tipos se alguém recompilar — este teste falha na mesma no CI.
   */
  it("cobre exatamente os desfechos do domínio mais os estados de UI", () => {
    expect(Object.keys(IVA_ROW_TONES).sort()).toEqual(
      [...IVA_OUTCOME_CODES, ...UI_STATES].sort(),
    );
  });

  it("dá a todos os estados um rótulo não vazio", () => {
    const states = [...IVA_OUTCOME_CODES, ...UI_STATES] as readonly IvaRowState[];
    for (const state of states) {
      expect(rowStateMeta(state).label.trim(), state).not.toBe("");
      expect(rowStateMeta(state).short.trim(), state).not.toBe("");
    }
  });

  it("usa o tom da severidade do desfecho", () => {
    for (const code of IVA_OUTCOME_CODES) {
      expect(IVA_ROW_TONES[code], code).toBe(SEVERITY_TONE[IVA_OUTCOMES[code].severity]);
    }
    for (const state of UI_STATES) {
      expect(IVA_ROW_TONES[state], state).toBe(UI_STATE_META[state].tone);
    }
  });
});

describe("rowStateMeta", () => {
  // Um desfecho de cada severidade: o rótulo vem do domínio (nunca duplicado
  // aqui) e a linha curta é a instrução genérica da severidade.
  it("traduz um desfecho `ok`", () => {
    expect(rowStateMeta("fetched")).toEqual({
      label: IVA_OUTCOMES.fetched.label,
      tone: "success",
      short: "Nada a fazer",
    });
  });

  it("traduz um desfecho `wait`", () => {
    expect(rowStateMeta("document_not_ready")).toEqual({
      label: IVA_OUTCOMES.document_not_ready.label,
      tone: "info",
      short: "Aguardar / tentar mais tarde",
    });
  });

  it("traduz um desfecho `action`", () => {
    expect(rowStateMeta("at_login_rejected")).toEqual({
      label: IVA_OUTCOMES.at_login_rejected.label,
      tone: "destructive",
      short: "Ação necessária",
    });
  });

  it("traduz um desfecho `support`", () => {
    expect(rowStateMeta("persist_rejected")).toEqual({
      label: IVA_OUTCOMES.persist_rejected.label,
      tone: "warning",
      short: "Contacte o suporte",
    });
  });

  it("traduz os estados de UI a partir de UI_STATE_META", () => {
    expect(rowStateMeta("queued")).toEqual(UI_STATE_META.queued);
    expect(rowStateMeta("never").label).toBe("Nunca buscada");
    expect(rowStateMeta("failed_unknown").tone).toBe("destructive");
  });
});
