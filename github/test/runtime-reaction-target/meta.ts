import type {MetaDSL} from "@metafor/types/metafor/schema"

const meta = {
  name: "Runtime Reaction Target",
  desc: "Observes a committed source context change through Energy Reaction",
  fields: [
    {key: "observed", type: "number", required: true, default: 0},
  ],
  superposition: [
    {name: "idle", transitions: {reacted: {observed: {eq: 2}}}},
    {name: "reacted"},
  ],
  reactions: [{
    key: "observe-source",
    label: "Observe source commit",
    cond: "() => ({meta: 'test/runtime-universe', op: 'replace', path: '/context'})",
    src: "({update}) => update({observed: 2})",
    read: ["observed"],
    write: ["observed"],
    states: ["idle"],
  }],
} satisfies MetaDSL

export default meta
