/** Pending request state owned by the policy-neutral Worker transport. */
export type PendingLayout<Success> = Readonly<{
  generation: number
  resolve(value: Success): void
  reject(error: Error): void
}>
