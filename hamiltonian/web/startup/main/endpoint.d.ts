/** Endpoint обновляемого Window importer для startup main. */
declare module "/import/*" {
  const importMain: () => Promise<void>

  export default importMain
}
