import { styled, Text as TamaguiText } from '@tamagui/core'

type TextVariant = 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6' | 'body1' | 'body2' | 'body3' | 'caption' | 'overline' | 'code' | 'link'
type TextColor = 'default' | 'muted' | 'inverse' | 'primary' | 'success' | 'warning' | 'error'
type TextAlign = 'left' | 'center' | 'right' | 'justify'
type TextWeight = 'light' | 'normal' | 'medium' | 'semibold' | 'bold'

const textConfig = {
  name: 'Text',
  variants: {
    variant: {
      heading1: { fontSize: 48, fontWeight: '700', lineHeight: 56, letterSpacing: -0.5 },
      heading2: { fontSize: 36, fontWeight: '700', lineHeight: 44, letterSpacing: -0.25 },
      heading3: { fontSize: 30, fontWeight: '600', lineHeight: 38, letterSpacing: -0.25 },
      heading4: { fontSize: 24, fontWeight: '600', lineHeight: 32, letterSpacing: 0 },
      heading5: { fontSize: 20, fontWeight: '600', lineHeight: 28, letterSpacing: 0 },
      heading6: { fontSize: 18, fontWeight: '600', lineHeight: 26, letterSpacing: 0 },
      body1: { fontSize: 16, fontWeight: '400', lineHeight: 24, letterSpacing: 0 },
      body2: { fontSize: 14, fontWeight: '400', lineHeight: 22, letterSpacing: 0 },
      body3: { fontSize: 13, fontWeight: '400', lineHeight: 20, letterSpacing: 0 },
      caption: { fontSize: 12, fontWeight: '400', lineHeight: 18, letterSpacing: 0.25 },
      overline: { fontSize: 11, fontWeight: '500', lineHeight: 16, letterSpacing: 0.5, textTransform: 'uppercase' },
      code: { fontSize: 13, fontWeight: '400', lineHeight: 20, letterSpacing: 0, fontFamily: '$mono' },
      link: { fontSize: 14, fontWeight: '500', lineHeight: 22, letterSpacing: 0, color: '$primary', textDecorationLine: 'underline' },
    },
    color: {
      default: { color: '$color' },
      muted: { color: '$colorMuted' },
      inverse: { color: '$colorInverse' },
      primary: { color: '$primary' },
      success: { color: '$success' },
      warning: { color: '$warning' },
      error: { color: '$error' },
    },
    align: {
      left: { textAlign: 'left' },
      center: { textAlign: 'center' },
      right: { textAlign: 'right' },
      justify: { textAlign: 'justify' },
    },
    weight: {
      light: { fontWeight: '300' },
      normal: { fontWeight: '400' },
      medium: { fontWeight: '500' },
      semibold: { fontWeight: '600' },
      bold: { fontWeight: '700' },
    },
    truncate: {
      true: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    },
    mono: {
      true: { fontFamily: '$mono' },
    },
  },
  defaultVariants: {
    variant: 'body1' as TextVariant,
    color: 'default' as TextColor,
    align: 'left' as TextAlign,
    weight: 'normal' as TextWeight,
  },
} as const

export const Text = styled(TamaguiText, textConfig)

export type TextProps = React.ComponentProps<typeof Text>