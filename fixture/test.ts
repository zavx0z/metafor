import { expect } from "bun:test"

expect.extend({
  toBeUUID(received: unknown) {
    const pass =
      typeof received === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(received)

    return {
      message: () => `expected ${String(received)} to be a valid UUID`,
      pass,
    }
  },
})
