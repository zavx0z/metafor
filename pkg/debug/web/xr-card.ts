/**
 * Re-export Card / flex / widgets / theme из @metafor/ui под старыми именами.
 *
 * Реализация Card / flex / widgets живёт в pkg/ui; здесь — alias'ы +
 * compatibility-type FlexItem (старое имя для FlexRowItem).
 */

export {
  Card,
  Z,
  flexRow,
  flexColumn,
  // theme.
  palette,
  toneFill,
  toneBorder,
  MaterialPalette,
  // widgets.
  button,
  badge,
  input,
  divider,
  scrollbar,
  autoButtonWidth,
  // types.
  type CardOpts,
  type DrawTextOpts,
  type HitBox,
  type FlexAlign,
  type FlexJustify,
  type FlexRowItem,
  type FlexRowItem as FlexItem,
  type FlexColumnItem,
  type FlexRowOpts,
  type FlexColumnOpts,
  type Tone,
  type ButtonOpts,
  type BadgeOpts,
  type InputOpts,
  type ScrollbarOpts,
} from "@metafor/ui"
