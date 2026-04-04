import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../index.ts"

describe("логические операторы с условиями", () => {
  describe("&& &&", () => {
    let elements: NodeType[]

    beforeAll(() => {
      // prettier-ignore
      // #region parse
      elements = parse<{ isAdmin: { type: "boolean" } }, { user: { role: { type: "string" } } }>(({ html, value, mass }) => html`
          <div>
            ${mass.user && value.isAdmin && html`
              <div class="admin">Admin Panel</div>
            `}
          </div>
      `)
      // #endregion parse
    })

    it("data", () => {
      expect(elements).toEqual(
        // #region expect
        [
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "log",
                data: ["/mass/user", "/value/isAdmin"],
                expr: "_[0] && _[1]",
                child: [
                  {
                    tag: "div",
                    type: "el",
                    string: {
                      class: "admin",
                    },
                    child: [
                      {
                        type: "text",
                        value: "Admin Panel",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]
        // #endregion expect
      )
    })
  })
})
