export default {
  name: "Capsule",
  desc: "MetaFor development acceptance root Atom",
  fields: [
    {key: "title", type: "string", label: "Title"},
  ],
  superposition: [],
  matter: [
    {
      kind: "wimp",
      src: "zavx0z/capsule/alpha",
      massBinding: {data: "/mass"},
      energyBinding: {data: "/energy"},
    },
    {kind: "wimp", src: "zavx0z/capsule/beta"},
  ],
}
