import { styled, View } from '@tamagui/core'

export const Switch = styled(View, {
  name: 'Switch',
  variants: {
    variant: {
      default: { trackColorOn: '$primary', trackColorOff: '$backgroundHover', thumbColor: '$background' },
      primary: { trackColorOn: '$primary', trackColorOff: '$backgroundHover', thumbColor: '$background' },
      success: { trackColorOn: '$success', trackColorOff: '$backgroundHover', thumbColor: '$background' },
      warning: { trackColorOn: '$warning', trackColorOff: '$backgroundHover', thumbColor: '$background' },
      error: { trackColorOn: '$error', trackColorOff: '$backgroundHover', thumbColor: '$background' },
    },
    size: {
      sm: { width: 36, height: 20, thumbSize: 16, thumbOffset: 2 },
      md: { width: 44, height: 24, thumbSize: 20, thumbOffset: 2 },
      lg: { width: 52, height: 28, thumbSize: 24, thumbOffset: 2 },
    },
    disabled: {
      true: { opacity: 0.5 },
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
})

export type SwitchProps = React.ComponentProps<typeof Switch>