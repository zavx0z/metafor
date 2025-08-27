import { describe, it, expect } from "bun:test"
import { extractMainHtmlBlock, extractHtmlElements } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"
import { extractAttributes } from "../attributes"

describe("nested.array", () => {
  it("4 уровня вложенности map с переменными из предыдущих уровней (полный тест)", () => {
    const mainHtml = extractMainHtmlBlock<
      any,
      {
        companies: {
          id: string
          active: boolean
          departments: {
            id: string
            active: boolean
            teams: {
              id: string
              active: boolean
              members: {
                id: string
                active: boolean
                name: string
                role: string
              }[]
            }[]
          }[]
        }[]
      }
    >(
      ({ html, core }) => html`
        <div>
          ${core.companies.map(
            (company) => html`
              <section data-company="${company.id}" ${company.active && "data-active"}>
                <h1>Company: ${company.id}</h1>
                <div class="company-${company.id}">Status: ${company.active ? "Active" : "Inactive"}</div>
                ${company.departments.map(
                  (dept) => html`
                    <article
                      data-company="${company.id}"
                      data-dept="${dept.id}"
                      ${company.active && dept.active && "data-active"}>
                      <h2>Dept: ${company.id}-${dept.id}</h2>
                      <div class="dept-${dept.id}">
                        Status: ${company.active && dept.active ? "Active" : "Inactive"}
                      </div>
                      ${dept.teams.map(
                        (team) => html`
                          <div
                            data-company="${company.id}"
                            data-dept="${dept.id}"
                            data-team="${team.id}"
                            ${company.active && dept.active && team.active && "data-active"}>
                            <h3>Team: ${company.id}-${dept.id}-${team.id}</h3>
                            <div class="team-${team.id}">
                              Status: ${company.active && dept.active && team.active ? "Active" : "Inactive"}
                            </div>
                            <meta-${team.id} />
                            ${team.members.map(
                              (member) => html`
                                <p
                                  data-company="${company.id}"
                                  data-dept="${dept.id}"
                                  data-team="${team.id}"
                                  data-member="${member.id}"
                                  class="member-${company.id}-${dept.id}-${team.id}-${member.id}"
                                  title="${member.name} (${member.role})"
                                  ${company.active && dept.active && team.active && member.active && "data-active"}>
                                  Member: ${company.id}-${dept.id}-${team.id}-${member.id} (${member.name})
                                  <span class="${member.active ? "online" : "offline"}">
                                    ${member.active ? "Online" : "Offline"}
                                  </span>
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
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)

    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            type: "map",
            data: "/core/companies",
            child: [
              {
                tag: "section",
                type: "el",
                child: [
                  {
                    tag: "h1",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        data: "[item]/id",
                        expr: "Company: ${0}",
                      },
                    ],
                  },
                  {
                    tag: "div",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        data: "[item]/active",
                        expr: 'Status: ${0 ? "Active" : "Inactive"}',
                      },
                    ],
                    string: {
                      class: {
                        data: "[item]/id",
                        expr: "company-${0}",
                      },
                    },
                  },
                  {
                    type: "map",
                    data: "[item]/departments",
                    child: [
                      {
                        tag: "article",
                        type: "el",
                        child: [
                          {
                            tag: "h2",
                            type: "el",
                            child: [
                              {
                                type: "text",
                                data: ["../[item]/id", "[item]/id"],
                                expr: "Dept: ${0}-${1}",
                              },
                            ],
                          },
                          {
                            tag: "div",
                            type: "el",
                            child: [
                              {
                                type: "text",
                                data: ["[item]/Status", "../[item]/active", "[item]/active"],
                                expr: '${0}: ${${1} && ${2} ? "Active" : "Inactive"}',
                              },
                            ],
                            string: {
                              class: {
                                data: "[item]/id",
                                expr: "dept-${0}",
                              },
                            },
                          },
                          {
                            type: "map",
                            data: "[item]/teams",
                            child: [
                              {
                                tag: "div",
                                type: "el",
                                child: [
                                  {
                                    tag: "h3",
                                    type: "el",
                                    child: [
                                      {
                                        type: "text",
                                        data: ["../../[item]/id", "../[item]/id", "[item]/id"],
                                        expr: "Team: ${0}-${1}-${2}",
                                      },
                                    ],
                                  },
                                  {
                                    tag: "div",
                                    type: "el",
                                    child: [
                                      {
                                        type: "text",
                                        data: [
                                          "../[item]/Status",
                                          "../../[item]/active",
                                          "../[item]/active",
                                          "[item]/active",
                                        ],
                                        expr: '${0}: ${${1} && ${2} && ${3} ? "Active" : "Inactive"}',
                                      },
                                    ],
                                    string: {
                                      class: {
                                        data: "[item]/id",
                                        expr: "team-${0}",
                                      },
                                    },
                                  },
                                  {
                                    tag: {
                                      data: "[item]/id",
                                      expr: "meta-${0}",
                                    },
                                    type: "meta",
                                  },
                                  {
                                    type: "map",
                                    data: "[item]/members",
                                    child: [
                                      {
                                        tag: "p",
                                        type: "el",
                                        child: [
                                          {
                                            type: "text",
                                            data: [
                                              "../../../[item]/id",
                                              "../../[item]/id",
                                              "../[item]/id",
                                              "[item]/id",
                                              "[item]/name",
                                            ],
                                            expr: "Member: ${0}-${1}-${2}-${3} (${4})",
                                          },
                                          {
                                            tag: "span",
                                            type: "el",
                                            child: [
                                              {
                                                type: "text",
                                                data: "[item]/active",
                                                expr: '${${0} ? "Online" : "Offline"}',
                                              },
                                            ],
                                            string: {
                                              class: {
                                                data: "[item]/active",
                                                expr: '${0} ? "online" : "offline"',
                                              },
                                            },
                                          },
                                        ],
                                        boolean: {
                                          "data-active": {
                                            data: [
                                              "../../../[item]/active",
                                              "../../[item]/active",
                                              "../[item]/active",
                                              "[item]/active",
                                            ],
                                            expr: "${0} && ${1} && ${2} && ${3}",
                                          },
                                        },
                                        string: {
                                          class: {
                                            data: [
                                              "../../../[item]/id",
                                              "../../[item]/id",
                                              "../[item]/id",
                                              "[item]/id",
                                            ],
                                            expr: "member-${0}-${1}-${2}-${3}",
                                          },
                                          "data-company": {
                                            data: "../../../[item]/id",
                                          },
                                          "data-dept": {
                                            data: "../../[item]/id",
                                          },
                                          "data-team": {
                                            data: "../[item]/id",
                                          },
                                          "data-member": {
                                            data: "[item]/id",
                                          },
                                          title: {
                                            data: ["[item]/name", "[item]/role"],
                                            expr: "${0} (${1})",
                                          },
                                        },
                                      },
                                    ],
                                  },
                                ],
                                boolean: {
                                  "data-active": {
                                    data: ["../../[item]/active", "../[item]/active", "[item]/active"],
                                    expr: "${0} && ${1} && ${2}",
                                  },
                                },
                                string: {
                                  "data-company": {
                                    data: "../../[item]/id",
                                  },
                                  "data-dept": {
                                    data: "../[item]/id",
                                  },
                                  "data-team": {
                                    data: "[item]/id",
                                  },
                                },
                              },
                            ],
                          },
                        ],
                        boolean: {
                          "data-active": {
                            data: ["../[item]/active", "[item]/active"],
                            expr: "${0} && ${1}",
                          },
                        },
                        string: {
                          "data-company": {
                            data: "../[item]/id",
                          },
                          "data-dept": {
                            data: "[item]/id",
                          },
                        },
                      },
                    ],
                  },
                ],
                boolean: {
                  "data-active": {
                    data: "[item]/active",
                  },
                },
                string: {
                  "data-company": {
                    data: "[item]/id",
                  },
                },
              },
            ],
          },
        ],
      },
    ])
  })
})
