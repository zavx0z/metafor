import type {DiagnosticLevel} from "./diagnostic-matrix"

export interface CapturedDiagnostic {
  level: DiagnosticLevel
  scope: unknown
  event: unknown
  details: unknown
}

/** Перехватывает diagnostics только внутри test-owned global и всегда возвращает console. */
export async function captureDiagnostics<T>(run: () => Promise<T>) {
  const debug = console.debug
  const error = console.error
  const diagnostics: CapturedDiagnostic[] = []
  console.debug = (scope, event, details) => {
    diagnostics.push({level: "debug", scope, event, details})
  }
  console.error = (scope, event, details) => {
    diagnostics.push({level: "error", scope, event, details})
  }

  try {
    return {result: await run(), diagnostics}
  } finally {
    console.debug = debug
    console.error = error
  }
}
