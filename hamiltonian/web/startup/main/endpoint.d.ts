/** Endpoint обновляемого Window importer для startup main. */
declare module "/code?module=*" {
  const importMain: () => Promise<void>

  export default importMain
}
