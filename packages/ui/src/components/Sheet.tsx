import { styled, View } from '@tamagui/core'

type SheetVariant = 'bottom' | 'modal' | 'side'
type SheetSize = 'sm' | 'md' | 'lg' | 'full'

const sheetConfig = {
  name: 'Sheet',
  variants: {
    variant: {
      bottom: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '$background',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        shadowColor: '$shadowColor',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        maxHeight: '85%',
      },
      modal: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: [{ translateX: -150 }, { translateY: -150 }],
        backgroundColor: '$background',
        borderRadius: 16,
        shadowColor: '$shadowColor',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        width: '90%',
        maxWidth: 400,
        maxHeight: '80%',
      },
      side: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '$background',
        borderTopLeftRadius: 20,
        borderBottomLeftRadius: 20,
        shadowColor: '$shadowColor',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        width: '85%',
        maxWidth: 400,
      },
    },
    size: {
      sm: { maxHeight: '40%' },
      md: { maxHeight: '60%' },
      lg: { maxHeight: '80%' },
      full: { maxHeight: '95%' },
    },
  },
  defaultVariants: {
    variant: 'bottom' as SheetVariant,
    size: 'md' as SheetSize,
  },
} as const

export const Sheet = styled(View, sheetConfig)

export type SheetProps = React.ComponentProps<typeof Sheet>