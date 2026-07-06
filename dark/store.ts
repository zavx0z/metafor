export const dark$ = {
  versions: new Map<string, {major: number; minor: number; patch: number}>(),

  hasVersion(src: string, version: {major: number; minor: number; patch: number}): boolean {
    const current = this.versions.get(src)
    return current?.major === version.major && current?.minor === version.minor && current?.patch === version.patch
  },
}
