import { styled, View } from '@tamagui/core'

export const Slider = styled(View, {
  name: 'Slider',
  variants: {
    variant: {
      default: { trackColor: '$backgroundHover', thumbColor: '$primary', thumbBorderColor: '$primary' },
      primary: { trackColor: '$primaryBackground', thumbColor: '$primary', thumbBorderColor: '$primary' },
      success: { trackColor: '$successBackground', thumbColor: '$success', thumbBorderColor: '$success' },
      warning: { trackColor: '$warningBackground', thumbColor: '$warning', thumbBorderColor: '$warning' },
      error: { trackColor: '$errorBackground', thumbColor: '$error', thumbBorderColor: '$error' },
    },
    size: {
      sm: { trackHeight: 2, thumbSize: 16, thumbBorderWidth: 2 },
      md: { trackHeight: 4, thumbSize: 20, thumbBorderWidth: 2 },
      lg: { trackHeight: 6, thumbSize: 24, thumbBorderWidth: 3 },
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

export type SliderProps = React.ComponentProps<typeof Slider>