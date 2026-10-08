import { TOPPING_KINDS, type ToppingKind } from './toppings'

/**
 * What a pointer press on the slime does: squish it, or stick that topping.
 * One choice instead of a "mode" switch plus a separate topping picker.
 */
export type Tool = 'squish' | ToppingKind

export const TOOLS: readonly Tool[] = ['squish', ...TOPPING_KINDS]

export const isToppingTool = (t: Tool): t is ToppingKind => t !== 'squish'
