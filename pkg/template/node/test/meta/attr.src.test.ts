import { describe, test, expect } from "bun:test"
import { parse } from "../../../index.ts"

describe("meta > src атрибут", () => {
  describe("валидные WIMP-адреса", () => {
    test("независимый peer Meta-репозиторий", () => {
      const result = parse(({ html }) => {
        html`<meta-for src="owner/project"></meta-for>`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "meta",
        tag: "meta-for",
        src: "owner/project",
      })
    })

    test("peer Meta-репозиторий с составным именем", () => {
      const result = parse(({ html }) => {
        html`<meta-for src="owner/project-profile"></meta-for>`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "meta",
        tag: "meta-for",
        src: "owner/project-profile",
      })
    })

    test("адрес с дефисами", () => {
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

    test("адрес с подчёркиваниями", () => {
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

  describe("невалидные WIMP-адреса", () => {
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

    test("src с запрещённым третьим сегментом", () => {
      expect(() => {
        parse(({ html }) => {
          html`<meta-for src="owner/project/profile"></meta-for>`
        })
      }).toThrow(/Невалидный src/)
    })

    test("src с четвёртым сегментом", () => {
      expect(() => {
        parse(({ html }) => {
          html`<meta-for src="owner/project/profile/nested"></meta-for>`
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

  describe("динамический src", () => {
    test("src из mass", () => {
      const result = parse(({ html, mass }) => {
        html`<meta-for src="${mass.component}"></meta-for>`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "meta",
        tag: "meta-for",
        src: {
          data: "/mass/component",
        },
      })
    })

    test("src из value", () => {
      const result = parse(({ html, value }) => {
        html`<meta-for src="${value.src}"></meta-for>`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "meta",
        tag: "meta-for",
        src: {
          data: "/value/src",
        },
      })
    })

    test("src с динамическим выражением", () => {
      const result = parse(({ html, mass }) => {
        html`<meta-for src="${mass.type === "admin" ? "org/admin" : "org/user"}"></meta-for>`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "meta",
        tag: "meta-for",
        src: {
          data: "/mass/type",
          expr: '${_[0] === "admin" ? "org/admin" : "org/user"}',
        },
      })
    })

    test("src с конкатенацией", () => {
      const result = parse(({ html, mass }) => {
        html`<meta-for src="${mass.org}/${mass.repo}"></meta-for>`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "meta",
        tag: "meta-for",
        src: {
          data: ["/mass/org", "/mass/repo"],
          expr: "${_[0]}/${_[1]}",
        },
      })
    })

    test("src в map", () => {
      const result = parse<any, { items: { src: { type: "string" } }[] }>(({ html, mass }) => {
        html`${mass.items.map((item) => html`<meta-for src="${item.src}"></meta-for>`)}`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "map",
        data: "/mass/items",
        child: [
          {
            type: "meta",
            tag: "meta-for",
            src: {
              data: "[item]/src",
            },
          },
        ],
      })
    })

    test("src в condition", () => {
      const result = parse(({ html, mass, value }) => {
        html`${value.show
          ? html`<meta-for src="${mass.src}"></meta-for>`
          : html`<meta-for src="default/src"></meta-for>`}`
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: "cond",
        data: "/value/show",
        child: [
          {
            type: "meta",
            tag: "meta-for",
            src: {
              data: "/mass/src",
            },
          },
          {
            type: "meta",
            tag: "meta-for",
            src: "default/src",
          },
        ],
      })
    })
  })
})
