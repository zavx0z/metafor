import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type Node } from "../../../index"

describe("events", () => {
  describe("onclick с выражением", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(({ html, mass }) => html`<button onclick=${() => mass.onClick()}>OK</button>`)
    })
    it("data", () => {
      expect(elements, "должен распознать onclick и не сериализовать функцию").toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              data: "/mass/onClick",
              expr: "() => _[0]()",
            },
          },
          child: [
            {
              type: "text",
              value: "OK",
            },
          ],
        },
      ])
    })
  })

  describe("onclick без кавычек со стрелочной функцией", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(({ html, mass }) => html`<button onclick=${mass.onClick}>OK</button>`)
    })
    it("data", () => {
      expect(elements, "onclick без кавычек со стрелочной функцией").toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              data: "/mass/onClick",
            },
          },
          child: [{ type: "text", value: "OK" }],
        },
      ])
    })
  })

  describe("onclick без значения (булев)", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(({ html }) => html`<button onclick>OK</button>`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "button",
          type: "el",
          child: [
            {
              type: "text",
              value: "OK",
            },
          ],
        },
      ])
    })
  })

  describe("несколько событий в самозакрывающемся теге", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(
        ({ html, mass }) => html`<input onclick=${() => mass.onClick()} oninput="${(e: Event) => mass.onInput(e)}" />`
      )
    })
    it("data", () => {
      expect(elements, "должен поддерживать несколько событий on*").toEqual([
        {
          tag: "input",
          type: "el",
          event: {
            onclick: {
              data: "/mass/onClick",
              expr: "() => _[0]()",
            },
            oninput: {
              data: "/mass/onInput",
              expr: "(e) => _[0](e)",
            },
          },
        },
      ])
    })
  })

  describe("oninput без кавычек со стрелочной функцией (input)", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse(({ html, mass }) => html`<input oninput=${(e: Event) => mass.onInput(e)} />`)
    })
    it("data", () => {
      expect(elements, "oninput без кавычек со стрелочной функцией").toEqual([
        {
          tag: "input",
          type: "el",
          event: {
            oninput: {
              data: "/mass/onInput",
              expr: "(e) => _[0](e)",
            },
          },
        },
      ])
    })
  })

  describe("событие внутри массива", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<any, { items: { name: string; onClick: () => void }[] }>(
        ({ html, mass }) => html`
          <ul>
            ${mass.items.map((item) => html`<li onclick=${() => item.onClick()}>${item.name}</li>`)}
          </ul>
        `
      )
    })

    it("data", () => {
      expect(elements, "событие внутри массива").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/items",
              child: [
                {
                  tag: "li",
                  type: "el",
                  event: {
                    onclick: {
                      data: "[item]/onClick",
                      expr: "() => _[0]()",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      data: "[item]/name",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("событие с параметрами в массиве", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<any, { buttons: { id: string; text: string; handleClick: (e: Event, id: string) => void }[] }>(
        ({ html, mass }) => html`
          <div>
            ${mass.buttons.map(
              (btn) => html` <button onclick=${(e: Event) => btn.handleClick(e, btn.id)}>${btn.text}</button> `
            )}
          </div>
        `
      )
    })

    it("data", () => {
      expect(elements, "событие с параметрами в массиве").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/buttons",
              child: [
                {
                  tag: "button",
                  type: "el",
                  event: {
                    onclick: {
                      data: ["[item]/handleClick", "[item]/id"],
                      expr: "(e) => _[0](e, _[1])",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      data: "[item]/text",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("смешанные события и обычные атрибуты", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<
        any,
        { handleSubmit: (e: Event) => void; handleChange: (e: Event) => void; onClick: () => void }
      >(
        ({ html, mass }) => html`
          <form onsubmit=${(e: Event) => mass.handleSubmit(e)} class="form" method="post">
            <input type="text" onchange=${(e: Event) => mass.handleChange(e)} />
            <button type="submit" onclick=${() => mass.onClick()}>Submit</button>
          </form>
        `
      )
    })

    it("data", () => {
      expect(elements, "смешанные события и обычные атрибуты").toEqual([
        {
          tag: "form",
          type: "el",
          event: {
            onsubmit: {
              data: "/mass/handleSubmit",
              expr: "(e) => _[0](e)",
            },
          },
          string: {
            class: "form",
            method: "post",
          },
          child: [
            {
              tag: "input",
              type: "el",
              string: {
                type: "text",
              },
              event: {
                onchange: {
                  data: "/mass/handleChange",
                  expr: "(e) => _[0](e)",
                },
              },
            },
            {
              tag: "button",
              type: "el",
              string: {
                type: "submit",
              },
              event: {
                onclick: {
                  data: "/mass/onClick",
                  expr: "() => _[0]()",
                },
              },
              child: [
                {
                  type: "text",
                  value: "Submit",
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("события с условными атрибутами", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<any, { onClick: () => void; isDisabled: boolean }>(
        ({ html, mass }) => html`
          <button onclick=${() => mass.onClick()} ${mass.isDisabled && "disabled"}>Click me</button>
        `
      )
    })
    it("data", () => {
      expect(elements, "события с условными атрибутами").toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              data: "/mass/onClick",
              expr: "() => _[0]()",
            },
          },
          boolean: {
            disabled: {
              data: "/mass/isDisabled",
            },
          },
          child: [
            {
              type: "text",
              value: "Click me",
            },
          ],
        },
      ])
    })
  })

  describe("вложенные события с несколькими уровнями map", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<
        any,
        {
          companies: {
            id: string
            name: string
            handleCompanyClick: (id: string) => void
            departments: {
              id: string
              name: string
              handleDeptClick: (companyId: string, deptId: string) => void
              teams: {
                id: string
                name: string
                handleTeamClick: (companyId: string, deptId: string, teamId: string) => void
                members: {
                  id: string
                  name: string
                  handleMemberClick: (companyId: string, deptId: string, teamId: string, memberId: string) => void
                }[]
              }[]
            }[]
          }[]
        }
      >(
        ({ html, mass }) => html`
          <div>
            ${mass.companies.map(
              (company) => html`
                <section onclick=${() => company.handleCompanyClick(company.id)}>
                  <h1>Company: ${company.name}</h1>
                  ${company.departments.map(
                    (dept) => html`
                      <article onclick=${() => dept.handleDeptClick(company.id, dept.id)}>
                        <h2>Dept: ${dept.name}</h2>
                        ${dept.teams.map(
                          (team) => html`
                            <div onclick=${() => team.handleTeamClick(company.id, dept.id, team.id)}>
                              <h3>Team: ${team.name}</h3>
                              ${team.members.map(
                                (member) => html`
                                  <p onclick=${() => member.handleMemberClick(company.id, dept.id, team.id, member.id)}>
                                    Member: ${member.name}
                                  </p>
                                `
                              )}
                            </div>
                          `
                        )}
                      </article>
                    `
                  )}
                </section>
              `
            )}
          </div>
        `
      )
    })

    it("data", () => {
      expect(elements, "вложенные события с правильными путями").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/companies",
              child: [
                {
                  tag: "section",
                  type: "el",
                  event: {
                    onclick: {
                      data: ["[item]/handleCompanyClick", "[item]/id"],
                      expr: "() => _[0](_[1])",
                    },
                  },
                  child: [
                    {
                      tag: "h1",
                      type: "el",
                      child: [
                        {
                          type: "text",
                          data: "[item]/name",
                          expr: "Company: ${_[0]}",
                        },
                      ],
                    },
                    {
                      type: "map",
                      data: "[item]/departments",
                      child: [
                        {
                          tag: "article",
                          type: "el",
                          event: {
                            onclick: {
                              data: ["[item]/handleDeptClick", "../[item]/id", "[item]/id"],
                              expr: "() => _[0](_[1], _[2])",
                            },
                          },
                          child: [
                            {
                              tag: "h2",
                              type: "el",
                              child: [
                                {
                                  type: "text",
                                  data: "[item]/name",
                                  expr: "Dept: ${_[0]}",
                                },
                              ],
                            },
                            {
                              type: "map",
                              data: "[item]/teams",
                              child: [
                                {
                                  tag: "div",
                                  type: "el",
                                  event: {
                                    onclick: {
                                      data: ["[item]/handleTeamClick", "../../[item]/id", "../[item]/id", "[item]/id"],
                                      expr: "() => _[0](_[1], _[2], _[3])",
                                    },
                                  },
                                  child: [
                                    {
                                      tag: "h3",
                                      type: "el",
                                      child: [
                                        {
                                          type: "text",
                                          data: "[item]/name",
                                          expr: "Team: ${_[0]}",
                                        },
                                      ],
                                    },
                                    {
                                      type: "map",
                                      data: "[item]/members",
                                      child: [
                                        {
                                          tag: "p",
                                          type: "el",
                                          event: {
                                            onclick: {
                                              data: [
                                                "[item]/handleMemberClick",
                                                "../../../[item]/id",
                                                "../../[item]/id",
                                                "../[item]/id",
                                                "[item]/id",
                                              ],
                                              expr: "() => _[0](_[1], _[2], _[3], _[4])",
                                            },
                                          },
                                          child: [
                                            {
                                              type: "text",
                                              data: "[item]/name",
                                              expr: "Member: ${_[0]}",
                                            },
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })
})
