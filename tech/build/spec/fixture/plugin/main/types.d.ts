declare module "*.fixture" { const source: string; export default source }
interface ImportMeta {
  readonly env: {readonly COSMOS_PACKAGE_VERSION: string}
}
