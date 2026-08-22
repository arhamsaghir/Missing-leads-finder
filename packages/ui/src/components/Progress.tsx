import { styled, View } from '@tamagui/core'

export const Progress = styled(View, {
  name: 'Progress',
  variants: {
    variant: {
      default: { backgroundColor: '$backgroundHover', borderColor: '$borderColor', borderWidth: 1 },
      primary: { backgroundColor: '$primaryBackground', borderColor: '$primaryBorder', borderWidth: 1 },
      success: { backgroundColor: '$successBackground', borderColor: '$successBorder', borderWidth: 1 },
      warning: { backgroundColor: '$warningBackground', borderColor: '$warningBorder', borderWidth: 1 },
      error: { backgroundColor: '$errorBackground', borderColor: '$errorBorder', borderWidth: 1 },
    },
    size: {
      sm: { height: 4, borderRadius: 2 },
      md: { height: 8, borderRadius: 4 },
      lg: { height: 12, borderRadius: 6 },
      xl: { height: 16, borderRadius: 8 },
    },
    animated: {
      true: { transition: 'width 300ms ease-out' },
    },
    striped: {
      true: {
        backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)',
        backgroundSize: '1rem 1rem',
      },
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
})

export type ProgressProps = React.ComponentProps<typeof Progress>