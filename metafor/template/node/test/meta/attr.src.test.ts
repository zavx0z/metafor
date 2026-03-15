import { describe, test, expect } from "bun:test"
import { parse } from "../../../index"

describe("meta > src атрибут", () => {
  describe("валидные hub-адреса", () => {
    test("простой hub-адрес", () => {
      const result = parse(({ html }) => {
        html`<meta-for src="zavx0z/git"></meta-for>`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "meta",
        tag: "meta-for",
        src: "zavx0z/git",
      })
    })

    test("hub-адрес с подпутём", () => {
      const result = parse(({ html }) => {
        html`<meta-for src="zavx0z/git/sub/path"></meta-for>`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "meta",
        tag: "meta-for",
        src: "zavx0z/git/sub/path",
      })
    })

    test("hub-адрес с дефисами", () => {
      const result = parse(({ html }) => {
        html`<meta-for src="my-org/my-repo"></meta-for>`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "meta",
        tag: "meta-for",
        src: "my-org/my-repo",
      })
    })

    test("hub-адрес с подчёркиваниями", () => {
      const result = parse(({ html }) => {
        html`<meta-for src="user_name/repo_name"></meta-for>`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "meta",
        tag: "meta-for",
        src: "user_name/repo_name",
      })
    })
  })

  describe("невалидные hub-адреса", () => {
    test("src с относительным путём ./", () => {
      expect(() => {
        parse(({ html }) => {
          html`<meta-for src="./path/to/meta"></meta-for>`
        })
      }).toThrow(/Невалидный src/)
    })

    test("src с относительным путём ../", () => {
      expect(() => {
        parse(({ html }) => {
          html`<meta-for src="../path/to/meta"></meta-for>`
        })
      }).toThrow(/Невалидный src/)
    })

    test("src с абсолютным путём /", () => {
      expect(() => {
        parse(({ html }) => {
          html`<meta-for src="/path/to/meta"></meta-for>`
        })
      }).toThrow(/Невалидный src/)
    })

    test("src без слэша", () => {
      expect(() => {
        parse(({ html }) => {
          html`<meta-for src="repo"></meta-for>`
        })
      }).toThrow(/Невалидный src/)
    })
  })

  describe("вложенные meta узлы", () => {
    test("валидные вложенные src", () => {
      const result = parse(({ html }) => {
        html`<meta-for src="parent/repo">
          <meta-for src="child/repo"></meta-for>
        </meta-for>`
      })
      expect(result).toHaveLength(1)
      const parent = result[0]!
      if ("child" in parent && parent.child) {
        expect(parent.child).toHaveLength(1)
        expect(parent.child[0]).toMatchObject({
          type: "meta",
          tag: "meta-for",
          src: "child/repo",
        })
      }
    })

    test("невалидный src во вложенном узле", () => {
      expect(() => {
        parse(({ html }) => {
          html`<meta-for src="parent/repo">
            <meta-for src="invalid"></meta-for>
          </meta-for>`
        })
      }).toThrow(/Невалидный src/)
    })
  })
})
