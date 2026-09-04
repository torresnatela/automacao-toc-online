import { describe, it, expect } from "vitest";
import {
  assertDocumentBelongsTo,
  assertPdfIntegrity,
  assertPeriodMatches,
} from "../../src/at/guards";
import { AtIntegrityError, AtTransientError, StructuralError } from "../../src/errors";

/** Um PDF plausível: cabeçalho certo e corpo com tamanho a sério. */
function pdf(body = "x".repeat(2000)): Buffer {
  return Buffer.from(`%PDF-1.7\n${body}\n%%EOF`, "latin1");
}

describe("assertPdfIntegrity", () => {
  it("deixa passar um PDF inteiro", () => {
    expect(() => assertPdfIntegrity(pdf())).not.toThrow();
  });

  it("recusa uma página HTML entregue como se fosse a guia", () => {
    const html = Buffer.from(`<!DOCTYPE html><html><body>${"a".repeat(2000)}</body></html>`);
    expect(() => assertPdfIntegrity(html)).toThrow(AtTransientError);
  });

  it("recusa HTML disfarçado de PDF pelos primeiros cinco bytes", () => {
    const disfarce = Buffer.from(`%PDF-1.7\n<HTML><body>erro</body></html>${"a".repeat(2000)}`);
    expect(() => assertPdfIntegrity(disfarce)).toThrow(AtTransientError);
  });

  it("recusa um download cortado a meio", () => {
    expect(() => assertPdfIntegrity(Buffer.from("%PDF-1.7\nmuito curto"))).toThrow(
      AtTransientError,
    );
  });

  it("classifica a falha como retentável, com o desfecho da captura", () => {
    // Retentável de propósito: download cortado e página de manutenção passam
    // sozinhos. Tratá-los como estruturais mandava um humano olhar para nada.
    try {
      assertPdfIntegrity(Buffer.from("nada disto é um pdf"));
      expect.unreachable("devia ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(AtTransientError);
      expect(err).not.toBeInstanceOf(StructuralError);
      expect((err as AtTransientError).outcome).toBe("document_capture_failed");
    }
  });
});

describe("assertDocumentBelongsTo", () => {
  it("deixa passar quando os NIFs coincidem", () => {
    expect(() => assertDocumentBelongsTo("501234567", "501234567")).not.toThrow();
  });

  it("ignora a formatação do NIF impresso", () => {
    expect(() => assertDocumentBelongsTo("501234567", "501 234 567")).not.toThrow();
  });

  it("bloqueia a guia de outro contribuinte", () => {
    expect(() => assertDocumentBelongsTo("501234567", "999888777")).toThrow(AtIntegrityError);
  });

  it("nunca põe nenhum dos dois NIFs na mensagem", () => {
    // A mensagem acaba num `last_error` que o dashboard mostra: o NIF de outro
    // contribuinte não pode viajar até lá.
    try {
      assertDocumentBelongsTo("501234567", "999888777");
      expect.unreachable("devia ter lançado");
    } catch (err) {
      const integrity = err as AtIntegrityError;
      expect(integrity.outcome).toBe("document_fields_mismatch");
      expect(integrity.message).not.toContain("501234567");
      expect(integrity.message).not.toContain("999888777");
      expect(integrity.message).not.toMatch(/\d/);
    }
  });

  it("um NIF ausente não acusa nada — em nenhum dos dois lados", () => {
    // Ilegível não é prova de troca; bloquear aqui faria um PDF bom com um
    // campo mal lido parecer a guia de outra empresa.
    expect(() => assertDocumentBelongsTo(null, "999888777")).not.toThrow();
    expect(() => assertDocumentBelongsTo("501234567", null)).not.toThrow();
    expect(() => assertDocumentBelongsTo(null, null)).not.toThrow();
  });

  it("um NIF sem dígitos nenhuns é ilegível, não é uma troca", () => {
    expect(() => assertDocumentBelongsTo("501234567", "n/d")).not.toThrow();
  });
});

describe("assertPeriodMatches", () => {
  it("deixa passar o período pedido, escrito à maneira do portal", () => {
    expect(() => assertPeriodMatches("2026-07", "julho de 2026")).not.toThrow();
    expect(() => assertPeriodMatches("2026-Q3", "3.º trimestre de 2026")).not.toThrow();
  });

  it("bloqueia a guia de outro período", () => {
    try {
      assertPeriodMatches("2026-07", "2026-06");
      expect.unreachable("devia ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(AtIntegrityError);
      expect((err as AtIntegrityError).outcome).toBe("document_fields_mismatch");
    }
  });

  it("um período ilegível é tratado como divergência, não como ausência", () => {
    // O campo estava lá e não se percebeu: guardar assim seria guardar uma guia
    // de período desconhecido com o nome do período pedido.
    expect(() => assertPeriodMatches("2026-07", "qualquer coisa")).toThrow(AtIntegrityError);
  });

  it("um período ausente não acusa nada", () => {
    expect(() => assertPeriodMatches("2026-07", null)).not.toThrow();
  });
});
