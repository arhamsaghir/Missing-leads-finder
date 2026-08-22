import { styled, View, Text } from '@tamagui/core'

export const Input = styled(View, {
  name: 'Input',
  variants: {
    variant: {
      default: {
        backgroundColor: '$background',
        borderWidth: 1,
        borderColor: '$borderColor',
        ':hover': { borderColor: '$borderColorHover' },
        ':focus': { borderColor: '$borderColorFocus', boxShadow: '0 0 0 2px $primaryFocus' },
        ':disabled': { backgroundColor: '$backgroundHover', opacity: 0.6, pointerEvents: 'none' },
      },
      filled: {
        backgroundColor: '$backgroundHover',
        borderWidth: 0,
        ':hover': { backgroundColor: '$backgroundPress' },
        ':focus': { boxShadow: '0 0 0 2px $primaryFocus' },
        ':disabled': { opacity: 0.6, pointerEvents: 'none' },
      },
      outline: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '$borderColor',
        ':hover': { borderColor: '$borderColorHover' },
        ':focus': { borderColor: '$borderColorFocus', boxShadow: '0 0 0 2px $primaryFocus' },
        ':disabled': { opacity: 0.6, pointerEvents: 'none' },
      },
    },
    size: {
      sm: { height: 32, paddingHorizontal: 10, borderRadius: 6 },
      md: { height: 40, paddingHorizontal: 12, borderRadius: 8 },
      lg: { height: 48, paddingHorizontal: 16, borderRadius: 10 },
    },
    error: {
      true: { borderColor: '$error', ':focus': { boxShadow: '0 0 0 2px $error' } },
    },
    fullWidth: {
      true: { width: '100%' },
    },
  },
  defaultVariants: {
    variant: 'default' as const,
    size: 'md' as const,
  },
})

export const InputText = styled(Text, {
  name: 'InputText',
  variants: {
    size: {
      sm: { fontSize: 13 },
      md: { fontSize: 14 },
      lg: { fontSize: 16 },
    },
  },
  defaultVariants: {
    size: 'md' as const,
  },
})

export type InputProps = React.ComponentProps<typeof Input>
export type InputTextProps = React.ComponentProps<typeof InputText>