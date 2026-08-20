import type * as elementsRuntime from "@ui/elements/runtime"
import type * as elementsSurface from "@ui/elements/surface"
import type * as elementsPrimitives from "@ui/elements/primitives"
import type * as elementsButton from "@ui/elements/button"
import type * as elementsDiv from "@ui/elements/div"
import type * as elementsSpan from "@ui/elements/span"
import type * as elementsText from "@ui/elements/text"
import type * as elementsImg from "@ui/elements/img"
import type * as elementsInput from "@ui/elements/input"
import type * as elementsList from "@ui/elements/list"
import type * as elementsScrollbar from "@ui/elements/scrollbar"
import type * as elementsStyle from "@ui/elements/style"
import type * as elementsFlex from "@ui/elements/flex"
import type * as elementsFlexCss from "@ui/elements/flex-css"
import type * as elementsTheme from "@ui/elements/theme"
import type * as elementsIcons from "@ui/elements/icons"
import type * as elementsIcon from "@ui/elements/icon"
import type * as elementsPolyline from "@ui/elements/polyline"
import type * as elementsVirtualInput from "@ui/elements/virtual-input"
import type * as elementsTargets from "@ui/elements/targets"
import type * as componentsButton from "@ui/components/button"
import type * as componentsField from "@ui/components/field"
import type * as componentsPane from "@ui/components/pane"
import type * as componentsCheckbox from "@ui/components/checkbox"
import type * as componentsBadge from "@ui/components/badge"
import type * as componentsTypography from "@ui/components/typography"
import type * as componentsTextField from "@ui/components/text-field"
import type * as componentsNumberInput from "@ui/components/number-input"
import type * as componentsColorInput from "@ui/components/color-input"
import type * as componentsVectorInput from "@ui/components/vector-input"
import type * as componentsMatrixInput from "@ui/components/matrix-input"
import type * as componentsReferenceInput from "@ui/components/reference-input"
import type * as componentsEnumInput from "@ui/components/enum-input"
import type * as componentsSwitcher from "@ui/components/switcher"
import type * as componentsProgressCheckbox from "@ui/components/progress-checkbox"
import type * as componentsSliderControl from "@ui/components/slider-control"
import type * as componentsDivider from "@ui/components/divider"
import type * as componentsList from "@ui/components/list"
import type * as componentsTable from "@ui/components/table"
import type * as nodeEditor from "@nodes/ui/node-editor"
import type * as blenderNode from "@nodes/ui/blender-node"
import type * as linkCurve from "@nodes/ui/link-curve"

export type ExactProductionImports = {
  elements: [
    typeof elementsRuntime,
    typeof elementsSurface,
    typeof elementsPrimitives,
    typeof elementsButton,
    typeof elementsDiv,
    typeof elementsSpan,
    typeof elementsText,
    typeof elementsImg,
    typeof elementsInput,
    typeof elementsList,
    typeof elementsScrollbar,
    typeof elementsStyle,
    typeof elementsFlex,
    typeof elementsFlexCss,
    typeof elementsTheme,
    typeof elementsIcons,
    typeof elementsIcon,
    typeof elementsPolyline,
    typeof elementsVirtualInput,
    typeof elementsTargets,
  ]
  components: [
    typeof componentsButton,
    typeof componentsField,
    typeof componentsPane,
    typeof componentsCheckbox,
    typeof componentsBadge,
    typeof componentsTypography,
    typeof componentsTextField,
    typeof componentsNumberInput,
    typeof componentsColorInput,
    typeof componentsVectorInput,
    typeof componentsMatrixInput,
    typeof componentsReferenceInput,
    typeof componentsEnumInput,
    typeof componentsSwitcher,
    typeof componentsProgressCheckbox,
    typeof componentsSliderControl,
    typeof componentsDivider,
    typeof componentsList,
    typeof componentsTable,
  ]
  nodeUi: [typeof nodeEditor, typeof blenderNode, typeof linkCurve]
}
