import type {MetaDSL} from "@metafor/types/metafor/schema"

/**
 * Neutral integration universe for the first observable core lifecycle.
 * It intentionally has no Matter children, Bulk, browser or provider binding.
 */
const meta = {
  name: "Runtime Universe",
  desc: "input=0 → input=1 → Energy process → output=2 → complete",
  fields: [
    {key: "input", type: "number", required: true, default: 0},
    {key: "output", type: "number", required: true, default: 0},
  ],
  superposition: [
    {name: "idle", transitions: {ready: {input: {eq: 1}}}},
    {name: "ready", transitions: {complete: {output: {eq: 2}}}},
    {name: "complete"},
  ],
  processes: [{
    key: "ready",
    declaration: {
      type: "action",
      env: ["server"],
      action: {
        src: "./unused.ts",
        wrapperSrc: "({value}) => ({output: Number(value.input) + 1})",
        read: ["input"],
      },
      success: {
        src: "({update, data}) => update({output: data.output})",
        write: ["output"],
      },
    },
  }],
} satisfies MetaDSL

export default meta
