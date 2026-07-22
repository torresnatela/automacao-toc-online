// Validadores de identificadores portugueses (puros — sem I/O).
//
// NIF (Número de Identificação Fiscal): 9 dígitos, o último é dígito de controlo
// (checksum mod-11 dos 8 primeiros). Validamos estrutura + dígito de controlo.
//
// NISS (Número de Identificação de Segurança Social): 11 dígitos. Validamos a
// estrutura (11 dígitos, sem zero à esquerda — nenhum NISS real começa por 0, e
// como o valor é persistido num bigint, um zero à esquerda seria silenciosamente
// perdido). O dígito de controlo do NISS NÃO é verificado aqui (algoritmo fica
// como melhoria futura); ver [[company-validate]].

/** NIF válido: 9 dígitos (1º não-zero) com dígito de controlo mod-11 correto. */
export function isValidNif(nif: string): boolean {
  if (!/^[1-9]\d{8}$/.test(nif)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(nif[i]) * (9 - i);
  }
  const mod = sum % 11;
  // Regra oficial: dígito de controlo = 11 - (soma mod 11); se der 10 ou 11 → 0.
  const check = mod < 2 ? 0 : 11 - mod;
  return check === Number(nif[8]);
}

/** NISS estruturalmente válido: 11 dígitos, sem zero à esquerda. */
export function isValidNiss(niss: string): boolean {
  return /^[1-9]\d{10}$/.test(niss);
}
