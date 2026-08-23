declare module "bun:test" {
  interface Matchers<T = unknown> {
    toBeUUID(): void
  }
}

export {}
