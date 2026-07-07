// Worker de RPA (Node + Playwright). SCAFFOLD — implementado em feature futura.
//
// Responsabilidade futura:
//   - consumir a tabela `jobs` (SELECT ... FOR UPDATE SKIP LOCKED);
//   - executar a automação de browser (TOConline + portais do Estado);
//   - registrar tudo via @toc/core (Tracer/Logger), ligado ao trace de origem.
//
// Roda fora da Vercel (Fly.io / Railway / container), pois exige processo de longa duração.
async function main(): Promise<void> {
  console.log("[worker] scaffold — nenhuma automação implementada ainda.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
