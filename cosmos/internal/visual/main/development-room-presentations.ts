import type {DOMComponentConstructor, Document} from "@zavx0z/immersive"
import createPresentation from "@zavx0z/storybook-app-web-page-presentation"
import type {SourceContentPresentation} from "@zavx0z/storybook-app-web-page-package/content"
import type {DevelopmentCatalog, DevelopmentPackage} from "../../../release/shared/development"
import {DevelopmentDependencyGraph, type DevelopmentDependencyGraphProps} from "./development-graph"
import {DevelopmentSource, type DevelopmentSourceClient, type DevelopmentSourceProps} from "./development-source"
import {createDevelopmentScenarioPresentation} from "./development-scenarios"

/** Один выбранный Package получает owner Source и manifest Graph в том же Document. */
export function createDevelopmentRoomPresentations(input: Readonly<{
  document: Document
  catalog: DevelopmentCatalog
  package: DevelopmentPackage
  sourceClient: DevelopmentSourceClient
  navigate(packageName: string): void
  onDirtyChange(dirty: boolean): void
}>): Readonly<{dependency: SourceContentPresentation; source: SourceContentPresentation | null;
  scenario: ReturnType<typeof createDevelopmentScenarioPresentation>}> {
  const dependencyProps: DevelopmentDependencyGraphProps = {catalog: input.catalog,
    selectedPackage: input.package.name, onSelectPackage: input.navigate}
  const dependency = createPresentation(input.document,
    DevelopmentDependencyGraph as unknown as DOMComponentConstructor<DevelopmentDependencyGraphProps>,
    dependencyProps, "[data-development-dependency-graph]")
  const source = input.package.resolution === "source" ? createPresentation(input.document,
    DevelopmentSource as unknown as DOMComponentConstructor<DevelopmentSourceProps>,
    {packageName: input.package.name, writable: input.package.writable, client: input.sourceClient,
      onDirtyChange: input.onDirtyChange}, "[data-development-source]") : null
  const scenario = createDevelopmentScenarioPresentation(input.document, input.package.name)
  return {dependency, source, scenario}
}
