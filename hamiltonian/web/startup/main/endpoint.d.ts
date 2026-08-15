/** Endpoint обновляемого Window importer для startup main. */
declare module "/import-main.*" {
  const importMain: (
    loader: typeof import("./loader"),
  ) => Promise<void>

  export default importMain
}
