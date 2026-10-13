export function reportQuantumDomainFailure(domain: string, phase: "peer" | "cleanup" | "shutdown", error: unknown): void {
  if (phase === "peer") console.error("[@cosmos/release:server:quantum]", "owned peer failed", {domain, error})
  else if (phase === "cleanup") console.error("[@cosmos/release:server:quantum]", "owned cleanup failed", {domain, error})
  else console.error("[@cosmos/release:server:quantum]", "owned shutdown failed", {domain, error})
}
