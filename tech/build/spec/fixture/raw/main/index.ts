export const value = 42
export const buildIdentity = {
  name: import.meta.env.COSMOS_PACKAGE_NAME,
  env: import.meta.env.COSMOS_PACKAGE_ENV,
  version: import.meta.env.COSMOS_PACKAGE_VERSION,
}
