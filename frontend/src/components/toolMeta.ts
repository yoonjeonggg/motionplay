import { Circle, Hand, Heart, type LucideIcon, Star } from 'lucide-react'
import type { Tool } from '../slime/tools'

export const TOOL_META: Record<Tool, { label: string; Icon: LucideIcon }> = {
  squish: { label: '주무르기', Icon: Hand },
  star: { label: '별 토핑', Icon: Star },
  heart: { label: '하트 토핑', Icon: Heart },
  pearl: { label: '진주 토핑', Icon: Circle },
}
