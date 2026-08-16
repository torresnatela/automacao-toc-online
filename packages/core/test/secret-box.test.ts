import { describe, it, expect } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  generateEncryptionKey,
  SecretCryptoError,
} from "../src/crypto/index";

// A chave é gerada no próprio teste: nenhum teste deste repo pode depender de
// uma chave real, nem lê-la do ambiente.
const KEY = generateEncryptionKey();
const SECRET = "IvoCunha-senha-de-exemplo-1971";

/** Junta tudo o que um erro pode expor ao ser registado por engano. */
function leakSurface(err: unknown): string {
  const e = err as Error;
  return [String(e), e?.stack ?? "", JSON.stringify(e), JSON.stringify(e?.message)].join("\n");
}

describe("encryptSecret / decryptSecret", () => {
  it("faz round-trip do segredo", () => {
    expect(decryptSecret(encryptSecret(SECRET, KEY), KEY)).toBe(SECRET);
  });

  it("preserva unicode e strings vazias", () => {
    for (const value of ["", "ção-ção", "🔐 chave", " espaço final "]) {
      expect(decryptSecret(encryptSecret(value, KEY), KEY)).toBe(value);
    }
  });

  it("nunca produz o mesmo token duas vezes (IV aleatório por cifragem)", () => {
    expect(encryptSecret(SECRET, KEY)).not.toBe(encryptSecret(SECRET, KEY));
  });

  it("o token não contém o texto claro", () => {
    expect(encryptSecret(SECRET, KEY)).not.toContain(SECRET);
  });

  it("produz o formato versionado v1:<iv>:<tag>:<ct>", () => {
    const parts = encryptSecret(SECRET, KEY).split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
    // IV de 12 bytes e tag de 16 bytes, em base64.
    expect(Buffer.from(parts[1] as string, "base64")).toHaveLength(12);
    expect(Buffer.from(parts[2] as string, "base64")).toHaveLength(16);
  });

  it("isEncryptedSecret reconhece o formato sem tentar decifrar", () => {
    expect(isEncryptedSecret(encryptSecret(SECRET, KEY))).toBe(true);
    expect(isEncryptedSecret("senha-em-claro")).toBe(false);
    expect(isEncryptedSecret(null)).toBe(false);
    expect(isEncryptedSecret(undefined)).toBe(false);
    expect(isEncryptedSecret("")).toBe(false);
  });
});

describe("erros de cifra", () => {
  it("chave ausente → missing_key", () => {
    expect(() => encryptSecret(SECRET, "")).toThrow(SecretCryptoError);
    try {
      encryptSecret(SECRET, "");
    } catch (err) {
      expect((err as SecretCryptoError).code).toBe("missing_key");
    }
  });

  it("chave que não tem 32 bytes → invalid_key", () => {
    const short = Buffer.alloc(16).toString("base64");
    try {
      encryptSecret(SECRET, short);
      throw new Error("devia ter lançado");
    } catch (err) {
      expect((err as SecretCryptoError).code).toBe("invalid_key");
    }
  });

  it("chave errada → decrypt_failed (a tag GCM não autentica)", () => {
    const token = encryptSecret(SECRET, KEY);
    try {
      decryptSecret(token, generateEncryptionKey());
      throw new Error("devia ter lançado");
    } catch (err) {
      expect((err as SecretCryptoError).code).toBe("decrypt_failed");
    }
  });

  it("ciphertext adulterado → decrypt_failed", () => {
    const [v, iv, tag, ct] = encryptSecret(SECRET, KEY).split(":");
    const bytes = Buffer.from(ct as string, "base64");
    bytes[0] = bytes[0]! ^ 0xff; // vira um bit
    const tampered = [v, iv, tag, bytes.toString("base64")].join(":");
    try {
      decryptSecret(tampered, KEY);
      throw new Error("devia ter lançado");
    } catch (err) {
      expect((err as SecretCryptoError).code).toBe("decrypt_failed");
    }
  });

  it("token malformado ou de versão desconhecida → malformed_token", () => {
    for (const bad of ["lixo", "v1:só:duas", "v2:a:b:c", ""]) {
      try {
        decryptSecret(bad, KEY);
        throw new Error(`devia ter lançado para ${JSON.stringify(bad)}`);
      } catch (err) {
        expect((err as SecretCryptoError).code).toBe("malformed_token");
      }
    }
  });

  // A regra que mais importa: um erro de cifra acaba quase sempre num log.
  it("nenhum erro expõe o segredo, a chave ou o token", () => {
    const token = encryptSecret(SECRET, KEY);
    const attempts = [
      () => encryptSecret(SECRET, ""),
      () => encryptSecret(SECRET, Buffer.alloc(16).toString("base64")),
      () => decryptSecret(token, generateEncryptionKey()),
      () => decryptSecret("lixo", KEY),
    ];

    for (const attempt of attempts) {
      try {
        attempt();
        throw new Error("devia ter lançado");
      } catch (err) {
        const surface = leakSurface(err);
        expect(surface).not.toContain(SECRET);
        expect(surface).not.toContain(KEY);
        expect(surface).not.toContain(token);
      }
    }
  });

  it("não propaga o erro cru do node:crypto como cause", () => {
    try {
      decryptSecret(encryptSecret(SECRET, KEY), generateEncryptionKey());
    } catch (err) {
      expect((err as Error).cause).toBeUndefined();
      expect(leakSurface(err)).not.toMatch(/unable to authenticate/i);
    }
  });
});

describe("chave a partir do ambiente", () => {
  it("usa CREDENTIALS_ENC_KEY quando a chave não é passada", () => {
    const previous = process.env.CREDENTIALS_ENC_KEY;
    process.env.CREDENTIALS_ENC_KEY = KEY;
    try {
      expect(decryptSecret(encryptSecret(SECRET))).toBe(SECRET);
    } finally {
      if (previous === undefined) delete process.env.CREDENTIALS_ENC_KEY;
      else process.env.CREDENTIALS_ENC_KEY = previous;
    }
  });

  it("sem CREDENTIALS_ENC_KEY nem argumento → missing_key", () => {
    const previous = process.env.CREDENTIALS_ENC_KEY;
    delete process.env.CREDENTIALS_ENC_KEY;
    try {
      expect(() => encryptSecret(SECRET)).toThrow(SecretCryptoError);
    } finally {
      if (previous !== undefined) process.env.CREDENTIALS_ENC_KEY = previous;
    }
  });
});

describe("generateEncryptionKey", () => {
  it("gera 32 bytes em base64, distintos a cada chamada", () => {
    const a = generateEncryptionKey();
    expect(Buffer.from(a, "base64")).toHaveLength(32);
    expect(a).not.toBe(generateEncryptionKey());
  });
});
