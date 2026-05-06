/**
 * Re-export Card / flex / Z из @metafor/ui под старыми именами.
 *
 * Реализация Card живёт в pkg/ui/src/card.ts; здесь — только alias'ы +
 * compatibility-type FlexItem (старое имя для FlexRowItem).
 */

export {
  Card,
  Z,
  flexRow,
  flexColumn,
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
} from "@metafor/ui"
