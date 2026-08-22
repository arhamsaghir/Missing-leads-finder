import { styled, View } from '@tamagui/core'

export const Card = styled(View, {
  name: 'Card',
  variants: {
    variant: {
      elevated: {
        backgroundColor: '$background',
        borderWidth: 0,
        shadowColor: '$shadowColor',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
      },
      outlined: {
        backgroundColor: '$background',
        borderWidth: 1,
        borderColor: '$borderColor',
      },
      filled: {
        backgroundColor: '$backgroundHover',
        borderWidth: 0,
      },
      ghost: {
        backgroundColor: 'transparent',
        borderWidth: 0,
      },
    },
    padding: {
      none: { padding: 0 },
      sm: { padding: 12 },
      md: { padding: 16 },
      lg: { padding: 24 },
      xl: { padding: 32 },
    },
    radius: {
      none: { borderRadius: 0 },
      sm: { borderRadius: 6 },
      md: { borderRadius: 10 },
      lg: { borderRadius: 14 },
      xl: { borderRadius: 18 },
      full: { borderRadius: 9999 },
    },
    hoverable: {
      true: {
        ':hover': {
          transform: [{ translateY: -2 }],
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 5,
        },
        transition: 'transform 150ms ease, box-shadow 150ms ease',
      },
    },
  },
  defaultVariants: {
    variant: 'elevated',
    padding: 'md',
    radius: 'md',
  },
})

export type CardProps = React.ComponentProps<typeof Card>