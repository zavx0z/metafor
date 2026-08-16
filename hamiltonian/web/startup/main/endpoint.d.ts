/** Endpoint обновляемого Window release для startup main. */
declare module "/code?module=*" {
  const releaseMain: () => Promise<void>

  export default releaseMain
}
