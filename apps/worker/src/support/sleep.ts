/** Espera `ms`. Havia três cópias desta linha no worker; passa a haver uma. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
