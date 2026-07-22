import { describe, it, expect } from "vitest";
import { isValidNif, isValidNiss } from "../src/domain/index";

describe("isValidNif", () => {
  it("aceita NIFs com dígito de controlo correto", () => {
    expect(isValidNif("500000000")).toBe(true); // soma 45 → mod 1 → controlo 0 (seed do gabinete demo)
    expect(isValidNif("123456789")).toBe(true); // soma 156 → mod 2 → controlo 9
    expect(isValidNif("501442600")).toBe(true); // soma 122 → mod 1 → controlo 0
  });

  it("rejeita NIF com dígito de controlo errado", () => {
    // 501234567: o dígito de controlo correto é 0, não 7.
    expect(isValidNif("501234567")).toBe(false);
    expect(isValidNif("500000001")).toBe(false);
  });

  it("rejeita estrutura inválida", () => {
    expect(isValidNif("")).toBe(false);
    expect(isValidNif("50000000")).toBe(false); // 8 dígitos
    expect(isValidNif("5000000000")).toBe(false); // 10 dígitos
    expect(isValidNif("50000000a")).toBe(false);
    expect(isValidNif("000000000")).toBe(false); // zero à esquerda
  });
});

describe("isValidNiss", () => {
  it("aceita 11 dígitos sem zero à esquerda", () => {
    expect(isValidNiss("12345678901")).toBe(true);
    expect(isValidNiss("20000000000")).toBe(true);
  });

  it("rejeita zero à esquerda (seria corrompido ao virar bigint)", () => {
    expect(isValidNiss("00000000000")).toBe(false);
    expect(isValidNiss("01234567890")).toBe(false);
  });

  it("rejeita comprimento diferente de 11 ou não-dígitos", () => {
    expect(isValidNiss("")).toBe(false);
    expect(isValidNiss("123")).toBe(false);
    expect(isValidNiss("123456789012")).toBe(false); // 12 dígitos
    expect(isValidNiss("1234567890a")).toBe(false);
  });
});
