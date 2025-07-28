import { describe, test, expect } from "bun:test"

describe("проброс контекста", () => {
    const tag = Bun.randomUUIDv7()
    MetaFor(tag)
})