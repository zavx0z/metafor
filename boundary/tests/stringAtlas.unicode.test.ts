import { describe, expect, test } from "bun:test"
import { StringAtlas } from "../src/strings/StringAtlas"

describe("StringAtlas — Unicode и корректность интернирования", () => {
  test("интернирует эквивалентные NFC/NFD строки в один StringId", () => {
    const atlas = new StringAtlas()

    const nfc = "café"
    const nfd = "cafe\u0301"

    const idNfc = atlas.intern(nfc)
    const idNfd = atlas.intern(nfd)

    expect(idNfc).toBe(idNfd)
    expect(atlas.count).toBe(1)
  })

  test("корректно хранит и возвращает эмодзи из дополнительных плоскостей", () => {
    const atlas = new StringAtlas()

    const id = atlas.intern("👍😂")
    const meta = atlas.getMeta(id)

    expect(meta).toBeDefined()
    expect(meta!.length).toBe(2)
    expect(atlas.getString(id)).toBe("👍😂")
  })

  test("различает строки с символом нулевой ширины и без него", () => {
    const atlas = new StringAtlas()

    const plain = "hello"
    const withZeroWidth = "hel\u200Blo"

    const plainId = atlas.intern(plain)
    const hiddenId = atlas.intern(withZeroWidth)

    expect(plainId).not.toBe(hiddenId)
    expect(atlas.count).toBe(2)
    expect(atlas.getString(plainId)).toBe(plain)
    expect(atlas.getString(hiddenId)).toBe(withZeroWidth)
  })

  test("корректно обрабатывает CJK-строки", () => {
    const atlas = new StringAtlas()

    const id = atlas.intern("你好")
    const meta = atlas.getMeta(id)

    expect(meta).toBeDefined()
    expect(meta!.length).toBe(2)
    expect(atlas.getString(id)).toBe("你好")
  })

  test("экспортирует registry в формате [pointer, length, hash]", () => {
    const atlas = new StringAtlas()

    const first = atlas.intern("alpha")
    const second = atlas.intern("βета")

    const exported = atlas.export()

    expect(first).toBe(0)
    expect(second).toBe(1)
    expect(exported.count).toBe(2)
    expect(exported.registry.length).toBe(6)

    const firstPtr = exported.registry[0]
    const firstLen = exported.registry[1]
    const firstHash = exported.registry[2]
    const secondPtr = exported.registry[3]
    const secondLen = exported.registry[4]
    const secondHash = exported.registry[5]

    expect(firstPtr).toBe(0)
    expect(firstLen).toBe(5)
    expect(firstHash).toBeGreaterThanOrEqual(0)

    expect(secondPtr).toBe(5)
    expect(secondLen).toBe(4)
    expect(secondHash).toBeGreaterThanOrEqual(0)
  })
})
