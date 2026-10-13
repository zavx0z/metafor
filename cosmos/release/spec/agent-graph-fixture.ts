import {GRAPH_SCHEMA, parseMetaAddress, type Graph} from "@metafor/types/metafor/graph"

/** Полный валидный Graph fixture; его resource Atom не зависит от подключения Agent. */
export function agentWorkspaceGraph(): Graph {
  const root = parseMetaAddress("@metafor/environment")!, agent = parseMetaAddress("@metafor/agent")!, chat = parseMetaAddress("@metafor/chat")!, resource = parseMetaAddress("@fixture/resource")!
  const template = (name: string) => ({name, fields: [], superposition: [], processes: [], mass: []})
  return {schema: GRAPH_SCHEMA, root, template: {
    [root]: {...template("Environment"), fields: [{key: "title", type: "string"}], matter: [{kind: "wimp", src: agent}, {kind: "wimp", src: resource}]},
    [agent]: {...template("Agent"), matter: [{kind: "wimp", src: chat}]},
    [chat]: template("Chat"), [resource]: template("Resource"),
  }, runtime: {roots: [{kind: "atom", ref: "atom:1", meta: root, declaration: "#/template/@metafor~1environment", state: null, values: {title: "Fixture"}, mass: [], children: [
    {kind: "atom", ref: "atom:2", meta: agent, declaration: "#/template/@metafor~1environment/matter/0", state: null, values: {}, mass: [], children: [
      {kind: "atom", ref: "atom:3", meta: chat, declaration: "#/template/@metafor~1agent/matter/0", state: null, values: {}, mass: []},
    ]},
    {kind: "atom", ref: "atom:4", meta: resource, declaration: "#/template/@metafor~1environment/matter/1", state: null, values: {}, mass: []},
  ]}], reactions: []}}
}
