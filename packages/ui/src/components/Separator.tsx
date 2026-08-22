import { styled, View } from '@tamagui/core'

type SeparatorOrientation = 'horizontal' | 'vertical'
type SeparatorVariant = 'default' | 'subtle' | 'strong' | 'dashed' | 'dotted'

const separatorConfig = {
  name: 'Separator',
  variants: {
    orientation: {
      horizontal: { width: '100%', height: 1 },
      vertical: { width: 1, height: '100%' },
    },
    variant: {
      default: { backgroundColor: '$borderColor' },
      subtle: { backgroundColor: '$borderColor', opacity: 0.5 },
      strong: { backgroundColor: '$borderColor', opacity: 1.5 },
      dashed: { backgroundColor: '$borderColor', borderStyle: 'dashed', borderWidth: 1 },
      dotted: { backgroundColor: '$borderColor', borderStyle: 'dotted', borderWidth: 1 },
    },
    fullWidth: {
      true: { width: '100%' },
    },
  },
  defaultVariants: {
    orientation: 'horizontal' as SeparatorOrientation,
    variant: 'default' as SeparatorVariant,
  },
} as const

export const Separator = styled(View, separatorConfig)

export type SeparatorProps = React.ComponentProps<typeof Separator>