import type { Tracer } from "./tracer";
import type { ErrorInput } from "./types";

export interface UserEventInput {
  /** Ação do usuário, sem o namespace: "login", "logout", "change_password"... */
  action: string;
  /** uuid do usuário (quando conhecido). */
  userId?: string;
  /** Componente emissor. Default: "web". */
  source?: string;
  /** Dados adicionais (nunca inclua senhas/segredos). */
  data?: Record<string, unknown>;
  /** Resultado do evento. Default: "succeeded". */
  status?: "succeeded" | "failed";
  /** Causa da falha (usado quando status === "failed"). */
  error?: ErrorInput;
}

/**
 * Registra um **evento de usuário** one-shot (login, logout, ...): abre um trace
 * `manual`, emite um único event `user.<action>` e o fecha (complete/fail).
 *
 * É o atalho idiomático para eventos que não geram cadeia. Fluxos de sistema
 * (integrações) devem abrir o trace e encadear events/logs diretamente.
 */
export async function recordUserEvent(tracer: Tracer, input: UserEventInput): Promise<void> {
  const source = input.source ?? "web";
  const trace = await tracer.startTrace({
    rootTrigger: "manual",
    triggerSource: source,
    createdBy: input.userId,
  });
  const event = await trace.event({
    type: `user.${input.action}`,
    source,
    payload: input.data ?? {},
  });

  if (input.status === "failed") {
    const error = input.error ?? { message: `user.${input.action} failed` };
    await event.fail(error);
    await trace.fail(error);
    return;
  }

  await event.succeed();
  await trace.complete();
}
