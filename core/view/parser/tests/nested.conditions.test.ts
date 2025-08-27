import { describe, it, expect } from "bun:test"
import { extractMainHtmlBlock, extractHtmlElements } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"
import { extractAttributes } from "../attributes"

describe("nested.conditions", () => {
  it("условия с элементами на разных уровнях вложенности с переменными из разных уровней", () => {
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
              <section data-company="${company.id}">
                <h1>Company: ${company.id}</h1>
                ${company.active
                  ? html`
                      <div class="company-active">
                        <h2>Active Company: ${company.id}</h2>
                        ${company.departments.map(
                          (dept) => html`
                            <div class="dept-summary">
                              ${dept.active
                                ? html`<span class="dept-active-summary">Active Dept: ${dept.id}</span>`
                                : html`<span class="dept-inactive-summary">Inactive Dept: ${dept.id}</span>`}
                            </div>
                          `
                        )}
                      </div>
                    `
                  : html`<div class="company-inactive">Inactive Company</div>`}
                ${company.departments.map(
                  (dept, deptIndex) => html`
                    <article data-dept="${dept.id}">
                      <h2>Dept: ${dept.id} (Index: ${deptIndex})</h2>
                      ${company.active && dept.active
                        ? html`<div class="dept-active">Active Department</div>`
                        : html`<div class="dept-inactive">Inactive Department</div>`}
                      ${dept.teams.map(
                        (team, teamIndex) => html`
                          <div data-team="${team.id}">
                            <h3>Team: ${team.id} (Dept Index: ${deptIndex}, Team Index: ${teamIndex})</h3>
                            ${company.active && dept.active && team.active
                              ? html`<div class="team-active">Active Team</div>`
                              : html`<div class="team-inactive">Inactive Team</div>`}
                            <meta-${team.id} />
                            ${team.members.map(
                              (member, memberIndex) => html`
                                <p data-member="${member.id}">
                                  <span class="member-name">${member.name}</span>
                                  <span class="member-indices">
                                    Indices: Dept=${deptIndex}, Team=${teamIndex}, Member=${memberIndex}
                                  </span>
                                  ${company.active && dept.active && team.active && member.active
                                    ? html`<span class="member-status-active">Fully Active</span>`
                                    : html`<span class="member-status-inactive">Not Fully Active</span>`}
                                  ${member.active
                                    ? html`<span class="member-online">Online</span>`
                                    : html`<span class="member-offline">Offline</span>`}
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
                string: {
                  "data-company": {
                    data: "[item]/id",
                  },
                },
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
                    type: "cond",
                    data: "[item]/active",
                    true: {
                      tag: "div",
                      type: "el",
                      string: {
                        class: "company-active",
                      },
                      child: [
                        {
                          tag: "h2",
                          type: "el",
                          child: [
                            {
                              type: "text",
                              data: "[item]/id",
                              expr: "Active Company: ${0}",
                            },
                          ],
                        },
                        {
                          type: "map",
                          data: "[item]/departments",
                          child: [
                            {
                              tag: "div",
                              type: "el",
                              string: {
                                class: "dept-summary",
                              },
                              child: [
                                {
                                  type: "cond",
                                  data: "[item]/active",
                                  true: {
                                    tag: "span",
                                    type: "el",
                                    string: {
                                      class: "dept-active-summary",
                                    },
                                    child: [
                                      {
                                        type: "text",
                                        data: "[item]/id",
                                        expr: "Active Dept: ${0}",
                                      },
                                    ],
                                  },
                                  false: {
                                    tag: "span",
                                    type: "el",
                                    string: {
                                      class: "dept-inactive-summary",
                                    },
                                    child: [
                                      {
                                        type: "text",
                                        data: "[item]/id",
                                        expr: "Inactive Dept: ${0}",
                                      },
                                    ],
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    false: {
                      tag: "div",
                      type: "el",
                      string: {
                        class: "company-inactive",
                      },
                      child: [
                        {
                          type: "text",
                          value: "Inactive Company",
                        },
                      ],
                    },
                  },
                  {
                    type: "map",
                    data: "[item]/departments",
                    child: [
                      {
                        tag: "article",
                        type: "el",
                        string: {
                          "data-dept": {
                            data: "[item]/id",
                          },
                        },
                        child: [
                          {
                            tag: "h2",
                            type: "el",
                            child: [
                              {
                                type: "text",
                                data: ["[item]/id", "[index]"],
                                expr: "Dept: ${0} (Index: ${1})",
                              },
                            ],
                          },
                          {
                            type: "cond",
                            data: ["../[item]/active", "[item]/active"],
                            expr: "${0} && ${1}",
                            true: {
                              tag: "div",
                              type: "el",
                              string: {
                                class: "dept-active",
                              },
                              child: [
                                {
                                  type: "text",
                                  value: "Active Department",
                                },
                              ],
                            },
                            false: {
                              tag: "div",
                              type: "el",
                              string: {
                                class: "dept-inactive",
                              },
                              child: [
                                {
                                  type: "text",
                                  value: "Inactive Department",
                                },
                              ],
                            },
                          },
                          {
                            type: "map",
                            data: "[item]/teams",
                            child: [
                              {
                                tag: "div",
                                type: "el",
                                string: {
                                  "data-team": {
                                    data: "[item]/id",
                                  },
                                },
                                child: [
                                  {
                                    tag: "h3",
                                    type: "el",
                                    child: [
                                      {
                                        type: "text",
                                        data: ["[item]/id", "../[index]", "[index]"],
                                        expr: "Team: ${0} (Dept Index: ${1}, Team Index: ${2})",
                                      },
                                    ],
                                  },
                                  {
                                    type: "cond",
                                    data: ["../../[item]/active", "../[item]/active", "[item]/active"],
                                    expr: "${0} && ${1} && ${2}",
                                    true: {
                                      tag: "div",
                                      type: "el",
                                      string: {
                                        class: "team-active",
                                      },
                                      child: [
                                        {
                                          type: "text",
                                          value: "Active Team",
                                        },
                                      ],
                                    },
                                    false: {
                                      tag: "div",
                                      type: "el",
                                      string: {
                                        class: "team-inactive",
                                      },
                                      child: [
                                        {
                                          type: "text",
                                          value: "Inactive Team",
                                        },
                                      ],
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
                                        string: {
                                          "data-member": {
                                            data: "[item]/id",
                                          },
                                        },
                                        child: [
                                          {
                                            tag: "span",
                                            type: "el",
                                            string: {
                                              class: "member-name",
                                            },
                                            child: [
                                              {
                                                type: "text",
                                                data: "[item]/name",
                                              },
                                            ],
                                          },
                                          {
                                            tag: "span",
                                            type: "el",
                                            string: {
                                              class: "member-indices",
                                            },
                                            child: [
                                              {
                                                type: "text",
                                                data: ["../../[index]", "../[index]", "[index]"],
                                                expr: "Indices: Dept=${0}, Team=${1}, Member=${2}",
                                              },
                                            ],
                                          },
                                          {
                                            type: "cond",
                                            data: "[item]/active",
                                            true: {
                                              tag: "span",
                                              type: "el",
                                              string: {
                                                class: "member-status-active",
                                              },
                                              child: [
                                                {
                                                  type: "text",
                                                  value: "Fully Active",
                                                },
                                              ],
                                            },
                                            false: {
                                              tag: "span",
                                              type: "el",
                                              string: {
                                                class: "member-status-inactive",
                                              },
                                              child: [
                                                {
                                                  type: "text",
                                                  value: "Not Fully Active",
                                                },
                                              ],
                                            },
                                          },
                                          {
                                            type: "cond",
                                            data: [
                                              "../../../[item]/active",
                                              "../../[item]/active",
                                              "../[item]/active",
                                              "[item]/active",
                                            ],
                                            expr: "${0} && ${1} && ${2} && ${3}",
                                            true: {
                                              tag: "span",
                                              type: "el",
                                              string: {
                                                class: "member-online",
                                              },
                                              child: [
                                                {
                                                  type: "text",
                                                  value: "Online",
                                                },
                                              ],
                                            },
                                            false: {
                                              tag: "span",
                                              type: "el",
                                              string: {
                                                class: "member-offline",
                                              },
                                              child: [
                                                {
                                                  type: "text",
                                                  value: "Offline",
                                                },
                                              ],
                                            },
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

  it("условия с индексами разных уровней вложенности", () => {
    const mainHtml = extractMainHtmlBlock<
      any,
      {
        companies: {
          id: string
          departments: {
            id: string
            teams: {
              id: string
              members: {
                id: string
                name: string
              }[]
            }[]
          }[]
        }[]
      }
    >(
      ({ html, core }) => html`
        <div>
          ${core.companies.map(
            (company, companyIndex) => html`
              <section data-company="${company.id}">
                <h1>Company ${companyIndex}: ${company.id}</h1>
                ${company.departments.map(
                  (dept, deptIndex) => html`
                    <article data-dept="${dept.id}">
                      <h2>Dept ${deptIndex} in Company ${companyIndex}: ${dept.id}</h2>
                      ${deptIndex === 0 && companyIndex === 0
                        ? html`<div class="first-dept-first-company">First Dept in First Company</div>`
                        : html`<div class="other-dept">Other Department</div>`}
                      ${dept.teams.map(
                        (team, teamIndex) => html`
                          <div data-team="${team.id}">
                            <h3>Team ${teamIndex} in Dept ${deptIndex}: ${team.id}</h3>
                            ${teamIndex === 0 && deptIndex === 0
                              ? html`<div class="first-team-first-dept">First Team in First Dept</div>`
                              : html`<div class="other-team">Other Team</div>`}
                            ${team.members.map(
                              (member, memberIndex) => html`
                                <p data-member="${member.id}">
                                  <span class="member-name">${member.name}</span>
                                  ${memberIndex === 0 && teamIndex === 0 && deptIndex === 0
                                    ? html`<span class="first-member-first-team-first-dept"
                                        >First Member in First Team in First Dept</span
                                      >`
                                    : html`<span class="other-member">Other Member</span>`}
                                  ${memberIndex > 0 && teamIndex > 0
                                    ? html`<span class="not-first-member-not-first-team"
                                        >Not First Member and Not First Team</span
                                      >`
                                    : html`<span class="first-member-or-first-team">First Member or First Team</span>`}
                                  ${companyIndex === 0 && deptIndex === 0 && teamIndex === 0 && memberIndex === 0
                                    ? html`<span class="all-first">All First</span>`
                                    : html`<span class="not-all-first">Not All First</span>`}
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
                string: {
                  "data-company": {
                    data: "[item]/id",
                  },
                },
                child: [
                  {
                    tag: "h1",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        data: ["[index]", "[item]/id"],
                        expr: "Company ${0}: ${1}",
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
                        string: {
                          "data-dept": {
                            data: "[item]/id",
                          },
                        },
                        child: [
                          {
                            tag: "h2",
                            type: "el",
                            child: [
                              {
                                type: "text",
                                data: ["[index]", "../[index]", "[item]/id"],
                                expr: "Dept ${0} in Company ${1}: ${2}",
                              },
                            ],
                          },
                          {
                            type: "cond",
                            data: ["[index]", "../[index]"],
                            expr: "${0} === 0 && ${1} === 0",
                            true: {
                              tag: "div",
                              type: "el",
                              string: {
                                class: "first-dept-first-company",
                              },
                              child: [
                                {
                                  type: "text",
                                  value: "First Dept in First Company",
                                },
                              ],
                            },
                            false: {
                              tag: "div",
                              type: "el",
                              string: {
                                class: "other-dept",
                              },
                              child: [
                                {
                                  type: "text",
                                  value: "Other Department",
                                },
                              ],
                            },
                          },
                          {
                            type: "map",
                            data: "[item]/teams",
                            child: [
                              {
                                tag: "div",
                                type: "el",
                                string: {
                                  "data-team": {
                                    data: "[item]/id",
                                  },
                                },
                                child: [
                                  {
                                    tag: "h3",
                                    type: "el",
                                    child: [
                                      {
                                        type: "text",
                                        data: ["[index]", "../[index]", "[item]/id"],
                                        expr: "Team ${0} in Dept ${1}: ${2}",
                                      },
                                    ],
                                  },
                                  {
                                    type: "cond",
                                    data: ["[index]", "../[index]"],
                                    expr: "${0} === 0 && ${1} === 0",
                                    true: {
                                      tag: "div",
                                      type: "el",
                                      string: {
                                        class: "first-team-first-dept",
                                      },
                                      child: [
                                        {
                                          type: "text",
                                          value: "First Team in First Dept",
                                        },
                                      ],
                                    },
                                    false: {
                                      tag: "div",
                                      type: "el",
                                      string: {
                                        class: "other-team",
                                      },
                                      child: [
                                        {
                                          type: "text",
                                          value: "Other Team",
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    type: "map",
                                    data: "[item]/members",
                                    child: [
                                      {
                                        tag: "p",
                                        type: "el",
                                        string: {
                                          "data-member": {
                                            data: "[item]/id",
                                          },
                                        },
                                        child: [
                                          {
                                            tag: "span",
                                            type: "el",
                                            string: {
                                              class: "member-name",
                                            },
                                            child: [
                                              {
                                                type: "text",
                                                data: "[item]/name",
                                              },
                                            ],
                                          },
                                          {
                                            type: "cond",
                                            data: ["../../../[index]", "../../[index]", "../[index]", "[index]"],
                                            expr: "${0} === 0 && ${1} === 0 && ${2} === 0 && ${3} === 0",
                                            true: {
                                              tag: "span",
                                              type: "el",
                                              string: {
                                                class: "first-member-first-team-first-dept",
                                              },
                                              child: [
                                                {
                                                  type: "text",
                                                  value: "First Member in First Team in First Dept",
                                                },
                                              ],
                                            },
                                            false: {
                                              tag: "span",
                                              type: "el",
                                              string: {
                                                class: "other-member",
                                              },
                                              child: [
                                                {
                                                  type: "text",
                                                  value: "Other Member",
                                                },
                                              ],
                                            },
                                          },
                                          {
                                            type: "cond",
                                            data: ["[index]", "../[index]"],
                                            expr: "${0} > 0 && ${1} > 0",
                                            true: {
                                              tag: "span",
                                              type: "el",
                                              string: {
                                                class: "not-first-member-not-first-team",
                                              },
                                              child: [
                                                {
                                                  type: "text",
                                                  value: "Not First Member and Not First Team",
                                                },
                                              ],
                                            },
                                            false: {
                                              tag: "span",
                                              type: "el",
                                              string: {
                                                class: "first-member-or-first-team",
                                              },
                                              child: [
                                                {
                                                  type: "text",
                                                  value: "First Member or First Team",
                                                },
                                              ],
                                            },
                                          },
                                          {
                                            type: "cond",
                                            data: ["[index]", "../[index]", "../../[index]"],
                                            expr: "${0} === 0 && ${1} === 0 && ${2} === 0",
                                            true: {
                                              tag: "span",
                                              type: "el",
                                              string: {
                                                class: "all-first",
                                              },
                                              child: [
                                                {
                                                  type: "text",
                                                  value: "All First",
                                                },
                                              ],
                                            },
                                            false: {
                                              tag: "span",
                                              type: "el",
                                              string: {
                                                class: "not-all-first",
                                              },
                                              child: [
                                                {
                                                  type: "text",
                                                  value: "Not All First",
                                                },
                                              ],
                                            },
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
