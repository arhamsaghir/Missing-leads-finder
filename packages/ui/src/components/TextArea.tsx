import { styled, View, Text } from '@tamagui/core'

export const TextArea = styled(View, {
  name: 'TextArea',
  variants: {
    variant: {
      default: {
        backgroundColor: '$background',
        borderWidth: 1,
        borderColor: '$borderColor',
        ':hover': { borderColor: '$borderColorHover' },
        ':focus': { borderColor: '$borderColorFocus', boxShadow: '0 0 0 3px $primaryFocus' },
        ':disabled': { backgroundColor: '$backgroundHover', opacity: 0.6, pointerEvents: 'none' },
      },
      filled: {
        backgroundColor: '$backgroundHover',
        borderWidth: 0,
        ':hover': { backgroundColor: '$backgroundPress' },
        ':focus': { boxShadow: '0 0 0 3px $primaryFocus' },
        ':disabled': { opacity: 0.6, pointerEvents: 'none' },
      },
      outline: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '$borderColor',
        ':hover': { borderColor: '$borderColorHover' },
        ':focus': { borderColor: '$borderColorFocus', boxShadow: '0 0 0 3px $primaryFocus' },
        ':disabled': { opacity: 0.6, pointerEvents: 'none' },
      },
    },
    size: {
      sm: { padding: 10, borderRadius: 8, minHeight: 80 },
      md: { padding: 12, borderRadius: 10, minHeight: 100 },
      lg: { padding: 16, borderRadius: 12, minHeight: 120 },
    },
    error: {
      true: { borderColor: '$error', ':focus': { boxShadow: '0 0 0 3px $errorBackground' } },
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

export const TextAreaText = styled(Text, {
  name: 'TextAreaText',
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

export type TextAreaProps = React.ComponentProps<typeof TextArea>
export type TextAreaTextProps = React.ComponentProps<typeof TextAreaText>