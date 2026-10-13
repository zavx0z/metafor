import type {Object3D} from "@zavx0z/immersive/engine"

/** Штатный native Asset принимает factory consumer adapter в уже существующем Space. */
export function OfficeAsset(props: Readonly<{factory: () => Object3D}>) {
  return <xr-asset name="Office shared instances" factory={props.factory} />
}
