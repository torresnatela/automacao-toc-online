import { describe, expect, it } from "vitest";
import {
  TOCONLINE_CONNECT_EXTENSION_ID,
  TOCONLINE_CONNECT_NAME,
  chromeExtensionRoots,
  crx3ZipOffset,
  describeManifest,
  pickLatestVersionDir,
  webStoreCrxUrl,
} from "../../src/browser/extension-package";

/**
 * A parte pura do `scripts/install-toconline-connect.ts`: onde procurar a
 * extensão, que versão escolher, como saltar o cabeçalho de um CRX3 e o que
 * exigir do `manifest.json`. Tudo sem tocar no disco nem na rede.
 */

function crx3(headerLength: number, payload: Buffer): Buffer {
  const magic = Buffer.from("Cr24", "ascii");
  const version = Buffer.alloc(4);
  version.writeUInt32LE(3, 0);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(headerLength, 0);
  return Buffer.concat([magic, version, length, Buffer.alloc(headerLength, 0xaa), payload]);
}

describe("pickLatestVersionDir", () => {
  it("escolhe a pasta de versão mais recente comparando número a número", () => {
    expect(pickLatestVersionDir(["2.1_0", "2.10_0", "1.9_0"])).toBe("2.10_0");
  });

  it("ignora pastas que não são versões (o Chrome deixa lá `Temp`)", () => {
    expect(pickLatestVersionDir(["Temp", "2.1_0"])).toBe("2.1_0");
  });

  it("devolve null quando não há nenhuma", () => {
    expect(pickLatestVersionDir([])).toBeNull();
    expect(pickLatestVersionDir(["Temp"])).toBeNull();
  });
});

describe("crx3ZipOffset", () => {
  it("salta magic, versão, tamanho e o cabeçalho para aterrar no ZIP", () => {
    const zip = Buffer.from("PK\u0003\u0004resto", "binary");
    const buffer = crx3(5, zip);
    const offset = crx3ZipOffset(buffer);
    expect(offset).toBe(12 + 5);
    expect(buffer.subarray(offset, offset + 2).toString("binary")).toBe("PK");
  });

  it("recusa o que não é CRX3 — magic errado ou versão 2", () => {
    expect(() => crx3ZipOffset(Buffer.from("PK\u0003\u0004", "binary"))).toThrow(/CRX3/);
    const v2 = crx3(0, Buffer.alloc(0));
    v2.writeUInt32LE(2, 4);
    expect(() => crx3ZipOffset(v2)).toThrow(/CRX3/);
  });

  it("recusa um ficheiro truncado antes do fim do cabeçalho", () => {
    const truncado = crx3(50, Buffer.alloc(0)).subarray(0, 20);
    expect(() => crx3ZipOffset(truncado)).toThrow(/truncado/);
  });
});

describe("chromeExtensionRoots", () => {
  it("no macOS aponta ao perfil do Google Chrome do utilizador", () => {
    expect(chromeExtensionRoots({ platform: "darwin", home: "/Users/x" })).toEqual([
      "/Users/x/Library/Application Support/Google/Chrome",
    ]);
  });

  it("no Linux considera o Chrome e o Chromium", () => {
    expect(chromeExtensionRoots({ platform: "linux", home: "/home/x" })).toEqual([
      "/home/x/.config/google-chrome",
      "/home/x/.config/chromium",
    ]);
  });

  it("no Windows usa o LOCALAPPDATA e devolve nada sem ele", () => {
    expect(
      chromeExtensionRoots({ platform: "win32", home: "C:\\Users\\x", localAppData: "C:\\L" }),
    ).toEqual(["C:\\L\\Google\\Chrome\\User Data"]);
    expect(chromeExtensionRoots({ platform: "win32", home: "C:\\Users\\x" })).toEqual([]);
  });
});

describe("webStoreCrxUrl", () => {
  it("pede o CRX3 da extensão pelo id à Web Store", () => {
    const url = new URL(webStoreCrxUrl(TOCONLINE_CONNECT_EXTENSION_ID));
    expect(url.host).toBe("clients2.google.com");
    expect(url.searchParams.get("acceptformat")).toBe("crx3");
    expect(url.searchParams.get("x")).toBe(`id=${TOCONLINE_CONNECT_EXTENSION_ID}&uc`);
    expect(url.searchParams.get("response")).toBe("redirect");
  });
});

describe("describeManifest", () => {
  it("devolve nome e versão de um manifest válido", () => {
    expect(
      describeManifest({ name: TOCONLINE_CONNECT_NAME, version: "2.1", manifest_version: 3 }),
    ).toEqual({ name: "TOConline Connect", version: "2.1", manifestVersion: 3 });
  });

  it("recusa um manifest que não é da extensão esperada", () => {
    expect(() => describeManifest({ name: "Outra", version: "1.0", manifest_version: 3 })).toThrow(
      /TOConline Connect/,
    );
    expect(() => describeManifest(null)).toThrow(/manifest/);
    expect(() => describeManifest({ name: TOCONLINE_CONNECT_NAME })).toThrow(/version/);
  });
});
