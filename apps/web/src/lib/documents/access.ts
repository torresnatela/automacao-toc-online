import { AT_ACCESS_MODES, type AtAccessMode } from "@toc/core/domain";

/**
 * Por que rota se chega ao Portal das Finanças.
 *
 * `AT_ACCESS_MODE` é **a mesma variável de ambiente que o worker lê** — as duas
 * pontas têm de concordar, porque o dashboard escolhe a credencial e escreve o
 * `access` no `jobs.payload` que o worker depois executa. Ler a env num só
 * sítio de cada lado é o que impede que uma delas ganhe um valor com um erro de
 * escrita e a outra continue a decidir pela rota antiga.
 *
 * Sem valor (ou com valor desconhecido) a rota é `at_direct_login`: é a que não
 * depende de nada configurado no TOConline, portanto a que falha de forma
 * legível em vez de silenciosa.
 */
export function getAtAccessMode(): AtAccessMode {
  const raw = process.env.AT_ACCESS_MODE;
  return AT_ACCESS_MODES.find((mode) => mode === raw) ?? "at_direct_login";
}
