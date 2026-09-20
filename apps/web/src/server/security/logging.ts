import type { DomainErrorCode } from "@slotly/domain";

export function writeSecurityLog(input: {
  readonly correlationId: string;
  readonly code: DomainErrorCode;
  readonly event: "http.request_rejected" | "http.internal_error";
}): void {
  const level = input.code === "INTERNAL_ERROR" ? "error" : "warn";
  console.error(JSON.stringify({ level, category: "security", event: input.event,
    correlationId: input.correlationId, code: input.code }));
}
