import type {HamiltonianWebPushOptions} from "./web-push/service.ts"
import {fileURLToPath} from "node:url"

export interface HamiltonianServerOptions {
  hostname?: string
  port?: number
  identity?: string
  version?: string
  token?: string
  tlsCertPath?: string
  tlsKeyPath?: string
  heartbeatMs?: number
  placement?: "browser" | "server"
  browserBundles?: Readonly<{
    orchestration: string | Promise<string>
    layoutWorker: string | Promise<string>
    serviceWorker: string | Promise<string>
    webPushClient?: string | Promise<string>
  }>
  webPush?: HamiltonianWebPushOptions
}

export interface HamiltonianServerConfiguration {
  hostname: string
  port: number
  identity: string
  version: string
  token: string
  tlsCertPath?: string
  tlsKeyPath?: string
  heartbeatMs: number
  placement: "browser" | "server"
  webPush: HamiltonianWebPushOptions
}

export function readHamiltonianServerConfiguration(
  options: HamiltonianServerOptions = {},
): HamiltonianServerConfiguration {
  const placement = options.placement ?? Bun.env.HAMILTONIAN_PLACEMENT ?? "browser"
  if (placement !== "browser" && placement !== "server") {
    throw new Error(`Unknown Hamiltonian placement: ${placement}`)
  }
  const tlsCertPath = options.tlsCertPath ?? Bun.env.HAMILTONIAN_TLS_CERT
  const tlsKeyPath = options.tlsKeyPath ?? Bun.env.HAMILTONIAN_TLS_KEY
  if ((tlsCertPath && !tlsKeyPath) || (!tlsCertPath && tlsKeyPath)) {
    throw new Error("HAMILTONIAN_TLS_CERT and HAMILTONIAN_TLS_KEY must be provided together")
  }
  const configuredVapidPublicKey = options.webPush?.publicKey ?? Bun.env.HAMILTONIAN_VAPID_PUBLIC_KEY
  const configuredVapidPrivateKey = options.webPush?.privateKey ?? Bun.env.HAMILTONIAN_VAPID_PRIVATE_KEY
  const configuredVapidSubject = options.webPush?.subject ?? Bun.env.HAMILTONIAN_VAPID_SUBJECT
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url))
  const storagePath = options.webPush?.storagePath ??
    (Bun.env.NODE_ENV === "test" ? undefined : `${repositoryRoot}/.metafor/hamiltonian-web-push.json`)
  return {
    hostname: options.hostname ?? Bun.env.HAMILTONIAN_HOST ?? "127.0.0.1",
    port: options.port ?? Number(Bun.env.HAMILTONIAN_PORT ?? 4400),
    identity: options.identity ?? Bun.env.HAMILTONIAN_ID ?? "hamiltonian-lab",
    version: options.version ?? Bun.env.HAMILTONIAN_VERSION ?? "v1",
    token: options.token ?? Bun.env.HAMILTONIAN_TOKEN ?? crypto.randomUUID(),
    ...(tlsCertPath === undefined ? {} : {tlsCertPath}),
    ...(tlsKeyPath === undefined ? {} : {tlsKeyPath}),
    heartbeatMs: options.heartbeatMs ?? 10_000,
    placement,
    webPush: {
      ...(configuredVapidPublicKey === undefined ? {} : {publicKey: configuredVapidPublicKey}),
      ...(configuredVapidPrivateKey === undefined ? {} : {privateKey: configuredVapidPrivateKey}),
      ...(configuredVapidSubject === undefined ? {} : {subject: configuredVapidSubject}),
      ...(storagePath === undefined ? {} : {storagePath}),
      ...(options.webPush?.send === undefined ? {} : {send: options.webPush.send}),
    },
  }
}
