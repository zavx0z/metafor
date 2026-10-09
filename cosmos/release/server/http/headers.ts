import type {BrowserPackageEnvironment} from "@metafor/tech-build/identity"

/** Разрешения исполняемого Service Worker принадлежат HTTP-хосту Cosmos. */
export function packageHeaders(env: BrowserPackageEnvironment): Record<string, string> {
  return env === "service" ? {
    "Content-Security-Policy": "script-src 'unsafe-eval'",
    "Service-Worker-Allowed": "/",
  } : {}
}
