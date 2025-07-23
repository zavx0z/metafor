declare global {
  var litElementHydrateSupport:
    | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | ((options: { LitElement: any }) => void)

  // Примечание: определяем как DEV_MODE, так и prod версии, поскольку этот файл не
  // собирается.
  var litElementPolyfillSupport:
    | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | ((options: { LitElement: any }) => void)

  var litElementPolyfillSupportDevMode: typeof litElementPolyfillSupport

  var litElementVersions: undefined | Array<string>
  var litIssuedWarnings: Set<string>
}

export {}
