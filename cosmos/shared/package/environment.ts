/** Точные среды выполнения одного Cosmos package. */
export const packageEnvironments = [
  "main",
  "worker",
  "service",
  "server",
  "server-worker",
] as const

export type PackageEnvironment = typeof packageEnvironments[number]

/** Среды, artifacts которых доставляются browser через Cache Storage. */
export const browserPackageEnvironments = [
  "main",
  "worker",
  "service",
] as const

export type BrowserPackageEnvironment = typeof browserPackageEnvironments[number]

export function isPackageEnvironment(value: string): value is PackageEnvironment {
  return packageEnvironments.some((environment) => environment === value)
}

export function isBrowserPackageEnvironment(value: string): value is BrowserPackageEnvironment {
  return browserPackageEnvironments.some((environment) => environment === value)
}
