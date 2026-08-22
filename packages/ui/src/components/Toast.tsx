import { styled, View } from '@tamagui/core'

export const Toast = styled(View, {
  name: 'Toast',
  variants: {
    variant: {
      default: { backgroundColor: '$background', borderColor: '$borderColor', borderWidth: 1 },
      success: { backgroundColor: '$successBackground', borderColor: '$successBorder', borderWidth: 1 },
      warning: { backgroundColor: '$warningBackground', borderColor: '$warningBorder', borderWidth: 1 },
      error: { backgroundColor: '$errorBackground', borderColor: '$errorBorder', borderWidth: 1 },
      info: { backgroundColor: '$primaryBackground', borderColor: '$primaryBorder', borderWidth: 1 },
    },
    position: {
      top: { top: 16, left: 16, right: 16 },
      bottom: { bottom: 16, left: 16, right: 16 },
      center: { top: '50%', left: 16, right: 16, transform: [{ translateY: -50 }] },
    },
  },
  defaultVariants: {
    variant: 'default',
    position: 'bottom',
  },
})

export type ToastProps = React.ComponentProps<typeof Toast>