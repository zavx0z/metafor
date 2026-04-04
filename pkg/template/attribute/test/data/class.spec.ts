import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index.ts"

describe("class атрибуты в data.ts", () => {
  describe("простые случаи", () => {
    describe("class в элементе с одним статическим значением", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse(({ html }) => html`<div class="div-active"></div>`)
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: "div-active",
            },
          },
        ])
      })
    })

    describe("class в элементе с одним статическим значением без кавычек", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse(({ html }) => html`<div class="div-active"></div>`)
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: "div-active",
            },
          },
        ])
      })
    })

    describe("class в элементе с несколькими статическими значениями", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse(({ html }) => html`<div class="div-active div-inactive"></div>`)
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: ["div-active", "div-inactive"],
            },
          },
        ])
      })
    })
  })

  describe("динамические значения", () => {
    describe("class в элементе с одним динамическим значением", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse<any, { active: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`<div class="${mass.active ? "active" : "inactive"}"></div>`,
        )
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: "/mass/active",
                expr: '${_[0] ? "active" : "inactive"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе с одним динамическим значением без кавычек", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse<any, { active: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`<div class=${mass.active ? "active" : "inactive"}></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: "/mass/active",
                expr: '${_[0] ? "active" : "inactive"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе с несколькими динамическими значениями", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse<any, { active: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`
            <div class="${mass.active ? "active" : "inactive"} ${mass.active ? "active" : "inactive"}"></div>
          `,
        )
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                {
                  data: "/mass/active",
                  expr: '${_[0] ? "active" : "inactive"}',
                },
                {
                  data: "/mass/active",
                  expr: '${_[0] ? "active" : "inactive"}',
                },
              ],
            },
          },
        ])
      })
    })

    describe("class в элементе с операторами сравнения", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse<any, { count: number }>(
          ({ html, mass }) => html`<div class="${mass.count > 5 ? "large" : "small"}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: "/mass/count",
                expr: '${_[0] > 5 ? "large" : "small"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе с операторами равенства", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse<any, { status: string }>(
          ({ html, mass }) => html`<div class="${mass.status === "loading" ? "loading" : "ready"}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: "/mass/status",
                expr: '${_[0] === "loading" ? "loading" : "ready"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе с логическими операторами", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<
          any,
          {
            active: { type: "boolean"; required: true; default: false }
            visible: { type: "boolean"; required: true; default: false }
          }
        >(({ html, mass }) => html`<div class="${mass.active && mass.visible ? "show" : "hide"}"></div>`)
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: ["/mass/active", "/mass/visible"],
                expr: '${_[0] && _[1] ? "show" : "hide"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе с оператором ИЛИ", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<
          any,
          {
            error: { type: "boolean"; required: true; default: false }
            warning: { type: "boolean"; required: true; default: false }
          }
        >(({ html, mass }) => html`<div class="${mass.error || mass.warning ? "alert" : "normal"}"></div>`)
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: ["/mass/error", "/mass/warning"],
                expr: '${_[0] || _[1] ? "alert" : "normal"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе с оператором НЕ", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, { disabled: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`<div class="${!mass.disabled ? "enabled" : "disabled"}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: "/mass/disabled",
                expr: '${!_[0] ? "enabled" : "disabled"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе с оператором И &&", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, { active: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`<div class="${mass.active && "active"}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: "/mass/active",
                expr: '${_[0] && "active"}',
              },
            },
          },
        ])
      })
    })
  })

  describe("смешанные значения", () => {
    describe("class в элементе с одним смешанным значением", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, { active: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`<div class="div-${mass.active ? "active" : "inactive"}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: "/mass/active",
                expr: 'div-${_[0] ? "active" : "inactive"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе с одним смешанным значением без кавычек", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, { active: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`<div class="div-${mass.active ? "active" : "inactive"}"></div>`,
        )
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: "/mass/active",
                expr: 'div-${_[0] ? "active" : "inactive"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе с несколькими смешанными значениями", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, { active: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) =>
            html`<div
              class="div-${mass.active ? "active" : "inactive"} div-${mass.active ? "active" : "inactive"}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                {
                  data: "/mass/active",
                  expr: 'div-${_[0] ? "active" : "inactive"}',
                },
                {
                  data: "/mass/active",
                  expr: 'div-${_[0] ? "active" : "inactive"}',
                },
              ],
            },
          },
        ])
      })
    })
  })

  describe("различные варианты", () => {
    describe("class в элементе с смешанным и статическим значениями", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, { active: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`<div class="div-${mass.active ? "active" : "inactive"} visible"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                {
                  data: "/mass/active",
                  expr: 'div-${_[0] ? "active" : "inactive"}',
                },
                "visible",
              ],
            },
          },
        ])
      })
    })

    describe("class в элементе с динамическим и статическим значениями", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, { active: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`<div class="${mass.active ? "active" : "inactive"} visible"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                {
                  data: "/mass/active",
                  expr: '${_[0] ? "active" : "inactive"}',
                },
                "visible",
              ],
            },
          },
        ])
      })
    })

    describe("class в элементе с тремя различными типами значений", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<
          any,
          {
            active: { type: "boolean"; required: true; default: false }
            type: { type: "string"; required: true; default: "" }
          }
        >(
          ({ html, mass }) =>
            html`<div class="static-value ${mass.active ? "active" : "inactive"} mixed-${mass.type}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                "static-value",
                {
                  data: "/mass/active",
                  expr: '${_[0] ? "active" : "inactive"}',
                },
                {
                  data: "/mass/type",
                  expr: "mixed-${_[0]}",
                },
              ],
            },
          },
        ])
      })
    })

    describe("class в элементе с несколькими смешанными значениями", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<
          any,
          {
            variant: { type: "string"; required: true; default: "" }
            size: { type: "string"; required: true; default: "" }
            theme: { type: "string"; required: true; default: "" }
          }
        >(({ html, mass }) => html`<div class="btn-${mass.variant} text-${mass.size} bg-${mass.theme}"></div>`)
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                {
                  data: "/mass/variant",
                  expr: "btn-${_[0]}",
                },
                {
                  data: "/mass/size",
                  expr: "text-${_[0]}",
                },
                {
                  data: "/mass/theme",
                  expr: "bg-${_[0]}",
                },
              ],
            },
          },
        ])
      })
    })

    describe("class в элементе с условными классами", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<
          any,
          {
            active: { type: "boolean"; required: true; default: false }
            disabled: { type: "boolean"; required: true; default: false }
          }
        >(
          ({ html, mass }) =>
            html`<div
              class="base-class ${mass.active ? "active" : "inactive"} ${mass.disabled ? "disabled" : ""}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                "base-class",
                {
                  data: "/mass/active",
                  expr: '${_[0] ? "active" : "inactive"}',
                },
                {
                  data: "/mass/disabled",
                  expr: '${_[0] ? "disabled" : ""}',
                },
              ],
            },
          },
        ])
      })
    })

    describe("class в элементе с вложенными выражениями", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, { nested: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`<div class="container ${mass.nested ? "nested" : "default"}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                "container",
                {
                  data: "/mass/nested",
                  expr: '${_[0] ? "nested" : "default"}',
                },
              ],
            },
          },
        ])
      })
    })

    describe("class в элементе с пустыми значениями", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<
          any,
          {
            hidden: { type: "boolean"; required: true; default: false }
            active: { type: "boolean"; required: true; default: false }
          }
        >(
          ({ html, mass }) =>
            html`<div class="visible ${mass.hidden ? "" : "show"} ${mass.active ? "active" : ""}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                "visible",
                {
                  data: "/mass/hidden",
                  expr: '${_[0] ? "" : "show"}',
                },
                {
                  data: "/mass/active",
                  expr: '${_[0] ? "active" : ""}',
                },
              ],
            },
          },
        ])
      })
    })

    describe("class в элементе с атрибутом без кавычек", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, { active: { type: "boolean"; required: true; default: false } }>(
          ({ html, mass }) => html`<div class="static-value-${mass.active ? "active" : "inactive"}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: "/mass/active",
                expr: 'static-value-${_[0] ? "active" : "inactive"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе со сложной строкой с несколькими переменными", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<
          any,
          {
            user: {
              id: { type: "string"; required: true; default: "" }
              role: { type: "string"; required: true; default: "" }
            }
            theme: { type: "string"; required: true; default: "" }
          }
        >(({ html, mass }) => html`<div class="user-${mass.user.id}-${mass.user.role}-${mass.theme}"></div>`)
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: ["/mass/user/id", "/mass/user/role", "/mass/theme"],
                expr: "user-${_[0]}-${_[1]}-${_[2]}",
              },
            },
          },
        ])
      })
    })

    describe("class в элементе со сложной строкой с условными выражениями", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<
          any,
          {
            user: {
              id: { type: "string"; required: true; default: "" }
              role: { type: "string"; required: true; default: "" }
            }
            theme: { type: "string"; required: true; default: "" }
            isActive: { type: "boolean"; required: true; default: false }
          }
        >(
          ({ html, mass }) =>
            html`<div
              class="user-${mass.user.id}-${mass.user.role}-${mass.theme}-${mass.isActive
                ? "active"
                : "inactive"}"></div>`,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: ["/mass/user/id", "/mass/user/role", "/mass/theme", "/mass/isActive"],
                expr: 'user-${_[0]}-${_[1]}-${_[2]}-${_[3] ? "active" : "inactive"}',
              },
            },
          },
        ])
      })
    })

    describe("class в элементе с массивом классов со сложной строкой", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse<
          any,
          {
            user: {
              id: { type: "string"; required: true; default: "" }
              role: { type: "string"; required: true; default: "" }
            }
            theme: { type: "string"; required: true; default: "" }
          }
        >(({ html, mass }) => html`<div class="base user-${mass.user.id}-${mass.user.role} theme-${mass.theme}"></div>`)
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                "base",
                {
                  data: ["/mass/user/id", "/mass/user/role"],
                  expr: "user-${_[0]}-${_[1]}",
                },
                {
                  data: "/mass/theme",
                  expr: "theme-${_[0]}",
                },
              ],
            },
          },
        ])
      })
    })

    describe("class в элементе с массивом классов и сложными условными выражениями", () => {
      let elements: NodeType[]
      beforeAll(() => {
        elements = parse<
          any,
          {
            user: {
              id: { type: "string"; required: true; default: "" }
              role: { type: "string"; required: true; default: "" }
            }
            theme: { type: "string"; required: true; default: "" }
            isActive: { type: "boolean"; required: true; default: false }
            isAdmin: { type: "boolean"; required: true; default: false }
          }
        >(
          ({ html, mass }) => html`
            <div
              class="
              base
              user-${mass.user.id}
              ${mass.isActive ? "active" : "inactive"}
              ${mass.isAdmin ? "admin" : "user"}
              theme-${mass.theme}
              "></div>
          `,
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "div",
            type: "el",
            array: {
              class: [
                "base",
                {
                  data: "/mass/user/id",
                  expr: "user-${_[0]}",
                },
                {
                  data: "/mass/isActive",
                  expr: '${_[0] ? "active" : "inactive"}',
                },
                {
                  data: "/mass/isAdmin",
                  expr: '${_[0] ? "admin" : "user"}',
                },
                {
                  data: "/mass/theme",
                  expr: "theme-${_[0]}",
                },
              ],
            },
          },
        ])
      })
    })
  })
  describe("постфикс с условием и статическими значениями", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<
        { status: { type: "boolean"; required: true; default: false } },
        { status: { type: "boolean"; required: true; default: false } }
      >(({ html, value }) => html`<div class="${value.status ? "active" : "inactive"}-status">Status</div>`)
    })
    it("data", () => {
      expect(elements, "суффикс с условием").toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/value/status",
              expr: '${_[0] ? "active" : "inactive"}-status',
            },
          },
          child: [
            {
              type: "text",
              value: "Status",
            },
          ],
        },
      ])
    })
  })
})
