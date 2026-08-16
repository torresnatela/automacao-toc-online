import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStorageStateStore, InMemoryStorageStateStore } from "../../src/toconline/storage-state";
import type { SavedSession } from "../../src/toconline/storage-state";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "rpa-state-"));
  dirs.push(dir);
  return dir;
}

function session(over: Partial<SavedSession> = {}): SavedSession {
  return {
    host: "app5.toconline.pt",
    origin: "https://app5.toconline.pt",
    state: {
      cookies: [
        {
          name: "sessao",
          value: "abc",
          domain: "app5.toconline.pt",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ],
      origins: [],
    } satisfies SavedSession["state"],
    savedAt: "2026-08-16T20:00:00.000Z",
    ...over,
  };
}

describe("FileStorageStateStore", () => {
  it("faz round-trip do estado guardado", async () => {
    const store = new FileStorageStateStore(await tempDir());
    await store.save("toconline:cred-1", session());

    const loaded = await store.load("toconline:cred-1");
    expect(loaded?.host).toBe("app5.toconline.pt");
    expect(loaded?.savedAt).toBe("2026-08-16T20:00:00.000Z");
  });

  it("devolve null para uma chave que não existe", async () => {
    const store = new FileStorageStateStore(await tempDir());
    expect(await store.load("toconline:nao-existe")).toBeNull();
  });

  it("clear remove o estado", async () => {
    const store = new FileStorageStateStore(await tempDir());
    await store.save("toconline:cred-1", session());
    await store.clear("toconline:cred-1");
    expect(await store.load("toconline:cred-1")).toBeNull();
  });

  it("clear de algo inexistente não lança", async () => {
    const store = new FileStorageStateStore(await tempDir());
    await expect(store.clear("toconline:nada")).resolves.toBeUndefined();
  });

  // O storageState são cookies de sessão do gabinete: é equivalente a
  // credencial e não pode ficar legível para outros utilizadores da máquina.
  it("grava o ficheiro com permissões 0600", async () => {
    const dir = await tempDir();
    const store = new FileStorageStateStore(dir);
    await store.save("toconline:cred-1", session());

    const files = await store.pathFor("toconline:cred-1");
    const info = await stat(files);
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("isola chaves distintas em ficheiros distintos", async () => {
    const store = new FileStorageStateStore(await tempDir());
    await store.save("toconline:a", session({ host: "app1.toconline.pt" }));
    await store.save("toconline:b", session({ host: "app9.toconline.pt" }));

    expect((await store.load("toconline:a"))?.host).toBe("app1.toconline.pt");
    expect((await store.load("toconline:b"))?.host).toBe("app9.toconline.pt");
  });

  it("sanitiza a chave no nome do ficheiro (nada de travessia de diretórios)", async () => {
    const dir = await tempDir();
    const store = new FileStorageStateStore(dir);
    const path = await store.pathFor("toconline:../../escapou");
    expect(path.startsWith(dir)).toBe(true);
    expect(path).not.toContain("..");
  });

  it("ficheiro corrompido é tratado como ausente, não como exceção", async () => {
    const dir = await tempDir();
    const store = new FileStorageStateStore(dir);
    await store.save("toconline:cred-1", session());
    const { writeFile } = await import("node:fs/promises");
    await writeFile(await store.pathFor("toconline:cred-1"), "{ isto não é json");

    expect(await store.load("toconline:cred-1")).toBeNull();
  });

  it("o conteúdo guardado é o estado do browser, e não a senha", async () => {
    const dir = await tempDir();
    const store = new FileStorageStateStore(dir);
    await store.save("toconline:cred-1", session());

    const raw = await readFile(await store.pathFor("toconline:cred-1"), "utf8");
    expect(raw).toContain("cookies");
    expect(raw).not.toContain("password");
  });
});

describe("InMemoryStorageStateStore", () => {
  it("comporta-se como o de ficheiro", async () => {
    const store = new InMemoryStorageStateStore();
    expect(await store.load("k")).toBeNull();
    await store.save("k", session());
    expect((await store.load("k"))?.host).toBe("app5.toconline.pt");
    await store.clear("k");
    expect(await store.load("k")).toBeNull();
  });
});
