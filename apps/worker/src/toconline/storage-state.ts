import { mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext } from "playwright";

/**
 * Persistência do `storageState` do Playwright entre execuções.
 *
 * **O que aqui se guarda é equivalente a uma credencial**: são os cookies de
 * sessão do gabinete no TOConline. Quem os tiver entra sem saber a senha. Daí
 * o modo 0600, o diretório git-ignored (`.rpa/`), e a regra de nunca aparecer
 * em log, payload ou evento.
 *
 * Reutilizar a sessão não é só otimização: evita repetir logins contra o portal
 * de um terceiro a cada job, que é exatamente o padrão que dispara defesas
 * anti-automação.
 */

export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export interface SavedSession {
  /** Host efetivo onde a sessão foi criada (o TOConline sharda por conta). */
  host: string;
  /**
   * Origem completa (`https://app5.toconline.pt`), usada para navegar.
   * Guardada em vez de reconstruída a partir do host: reconstruir obrigaria a
   * fixar o esquema, e um `https://` codificado tornaria esta classe
   * intestável contra um servidor local.
   */
  origin: string;
  state: StorageState;
  /** ISO — permite decidir mais tarde uma política de expiração. */
  savedAt: string;
}

export interface StorageStateStore {
  load(key: string): Promise<SavedSession | null>;
  save(key: string, saved: SavedSession): Promise<void>;
  clear(key: string): Promise<void>;
}

/** Achata a chave para um nome de ficheiro seguro — sem travessia de diretórios. */
function safeName(key: string): string {
  return `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
}

export class FileStorageStateStore implements StorageStateStore {
  constructor(private readonly dir: string) {}

  async pathFor(key: string): Promise<string> {
    return join(this.dir, safeName(key));
  }

  async load(key: string): Promise<SavedSession | null> {
    try {
      const raw = await readFile(await this.pathFor(key), "utf8");
      return JSON.parse(raw) as SavedSession;
    } catch {
      // Ausente ou corrompido dão no mesmo para quem chama: não há sessão
      // reutilizável, faz-se login. Um ficheiro partido não pode derrubar o job.
      return null;
    }
  }

  async save(key: string, saved: SavedSession): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const path = await this.pathFor(key);
    await writeFile(path, JSON.stringify(saved), { mode: 0o600 });
    // chmod explícito: o `mode` do writeFile é mascarado pelo umask do processo
    // e não se aplica de todo quando o ficheiro já existia.
    await chmod(path, 0o600);
  }

  async clear(key: string): Promise<void> {
    await rm(await this.pathFor(key), { force: true });
  }
}

/** Para testes: mesma semântica, sem tocar no disco. */
export class InMemoryStorageStateStore implements StorageStateStore {
  private readonly entries = new Map<string, SavedSession>();

  async load(key: string): Promise<SavedSession | null> {
    return this.entries.get(key) ?? null;
  }
  async save(key: string, saved: SavedSession): Promise<void> {
    this.entries.set(key, saved);
  }
  async clear(key: string): Promise<void> {
    this.entries.delete(key);
  }
}
