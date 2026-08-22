import { styled, View, Text } from '@tamagui/core'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success'
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

const buttonConfig = {
  name: 'Button',
  variants: {
    variant: {
      primary: {
        backgroundColor: '$primary',
        borderColor: '$primary',
      },
      secondary: {
        backgroundColor: '$background',
        borderColor: '$borderColor',
      },
      outline: {
        backgroundColor: 'transparent',
        borderColor: '$primary',
      },
      ghost: {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
      },
      destructive: {
        backgroundColor: '$error',
        borderColor: '$error',
      },
      success: {
        backgroundColor: '$success',
        borderColor: '$success',
      },
    },
    size: {
      sm: { height: 32, paddingHorizontal: 12, borderRadius: 6 },
      md: { height: 40, paddingHorizontal: 16, borderRadius: 8 },
      lg: { height: 48, paddingHorizontal: 24, borderRadius: 10 },
      xl: { height: 56, paddingHorizontal: 32, borderRadius: 12 },
    },
    fullWidth: {
      true: { width: '100%' },
    },
    disabled: {
      true: { opacity: 0.5, pointerEvents: 'none' },
    },
    loading: {
      true: { opacity: 0.7 },
    },
  },
  defaultVariants: {
    variant: 'primary' as ButtonVariant,
    size: 'md' as ButtonSize,
  },
} as const

export const Button = styled(View, buttonConfig)

const buttonTextConfig = {
  name: 'ButtonText',
  variants: {
    variant: {
      primary: { color: '$colorInverse' },
      secondary: { color: '$color' },
      outline: { color: '$primary' },
      ghost: { color: '$primary' },
      destructive: { color: '$colorInverse' },
      success: { color: '$colorInverse' },
    },
    size: {
      sm: { fontSize: 13 },
      md: { fontSize: 14 },
      lg: { fontSize: 16 },
      xl: { fontSize: 18 },
    },
  },
  defaultVariants: {
    variant: 'primary' as ButtonVariant,
    size: 'md' as ButtonSize,
  },
} as const

export const ButtonText = styled(Text, buttonTextConfig)

export type ButtonProps = React.ComponentProps<typeof Button>
export type ButtonTextProps = React.ComponentProps<typeof ButtonText>