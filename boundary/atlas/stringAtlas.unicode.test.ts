/**
 * Тесты StringAtlas Unicode.
 */
import { describe, expect, test } from "bun:test"
import { StringAtlas } from "./index"

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

  test("корректно хранит и возвращает эмодзи", () => {
    const atlas = new StringAtlas()
    const id = atlas.intern("👍😂")
    const meta = atlas.getMeta(id)
    expect(meta).toBeDefined()
    expect(meta!.length).toBe(2)
    expect(atlas.getString(id)).toBe("👍😂")
  })

  test("различает строки с символом нулевой ширины", () => {
    const atlas = new StringAtlas()
    const plain = "hello"
    const withZeroWidth = "hel\u200Blo"
    const plainId = atlas.intern(plain)
    const hiddenId = atlas.intern(withZeroWidth)
    expect(plainId).not.toBe(hiddenId)
    expect(atlas.count).toBe(2)
  })

  test("корректно обрабатывает CJK-строки", () => {
    const atlas = new StringAtlas()
    const id = atlas.intern("你好")
    const meta = atlas.getMeta(id)
    expect(meta).toBeDefined()
    expect(meta!.length).toBe(2)
  })

  test("экспортирует registry в формате [pointer, length, hash]", () => {
    const atlas = new StringAtlas()
    atlas.intern("alpha")
    atlas.intern("βета")
    const exported = atlas.exportData()
    expect(exported.count).toBe(2)
    expect(exported.registry.length).toBe(6)
  })
})
