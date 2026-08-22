import { styled, View, Text } from '@tamagui/core'

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'outline'
type BadgeSize = 'sm' | 'md' | 'lg'

const badgeConfig = {
  name: 'Badge',
  variants: {
    variant: {
      default: { backgroundColor: '$background', borderColor: '$borderColor', borderWidth: 1 },
      primary: { backgroundColor: '$primaryBackground', borderColor: '$primaryBorder', borderWidth: 1 },
      success: { backgroundColor: '$successBackground', borderColor: '$successBorder', borderWidth: 1 },
      warning: { backgroundColor: '$warningBackground', borderColor: '$warningBorder', borderWidth: 1 },
      error: { backgroundColor: '$errorBackground', borderColor: '$errorBorder', borderWidth: 1 },
      outline: { backgroundColor: 'transparent', borderColor: '$borderColor', borderWidth: 1 },
    },
    size: {
      sm: { height: 20, paddingHorizontal: 8, borderRadius: 10, gap: 4 },
      md: { height: 24, paddingHorizontal: 10, borderRadius: 12, gap: 6 },
      lg: { height: 28, paddingHorizontal: 12, borderRadius: 14, gap: 8 },
    },
    dot: {
      true: { flexDirection: 'row', alignItems: 'center' },
    },
  },
  defaultVariants: {
    variant: 'default' as BadgeVariant,
    size: 'md' as BadgeSize,
  },
} as const

export const Badge = styled(View, badgeConfig)

const badgeTextConfig = {
  name: 'BadgeText',
  variants: {
    size: {
      sm: { fontSize: 11 },
      md: { fontSize: 12 },
      lg: { fontSize: 13 },
    },
  },
  defaultVariants: {
    size: 'md' as BadgeSize,
  },
} as const

export const BadgeText = styled(Text, badgeTextConfig)

export type BadgeProps = React.ComponentProps<typeof Badge>
export type BadgeTextProps = React.ComponentProps<typeof BadgeText>