export interface PackageJsonTemplate {
  name: string
  version: string
  description: string
  type: string
  private: boolean
  exports: Record<string, string>
  dependencies: Record<string, string>
  scripts: Record<string, string>
}

/**
 * Сгенерировать package.json для пакета
 */
export function generatePackageJson(
  packageName: string,
  description: string
): PackageJsonTemplate {
  return {
    name: `@zavx0z/${packageName}`,
    version: "0.1.0",
    description: description,
    type: "module",
    private: true,
    exports: {
      ".": "./src/meta.ts",
    },
    dependencies: {
      "@metafor/meta": "link:@metafor/meta",
      "@metafor/build": "link:@metafor/build",
    },
    scripts: {
      build: `metafor-build src/meta.ts --out ${packageName}.json`,
    },
  }
}
