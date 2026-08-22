import { styled, View } from '@tamagui/core'

type ScrollDirection = 'vertical' | 'horizontal'

const scrollViewConfig = {
  name: 'ScrollView',
  variants: {
    direction: {
      vertical: { flexDirection: 'column' },
      horizontal: { flexDirection: 'row' },
    },
    showsScrollIndicator: {
      true: {},
      false: {},
    },
    contentContainerStyle: {
      true: { flexGrow: 1 },
    },
    scrollEnabled: {
      true: {},
      false: {},
    },
    pagingEnabled: {
      true: {},
      false: {},
    },
    bounces: {
      true: {},
      false: {},
    },
    alwaysBounceVertical: {
      true: {},
      false: {},
    },
    alwaysBounceHorizontal: {
      true: {},
      false: {},
    },
  },
  defaultVariants: {
    direction: 'vertical' as ScrollDirection,
    showsScrollIndicator: false,
  },
} as const

export const ScrollView = styled(View, scrollViewConfig)

export type ScrollViewProps = React.ComponentProps<typeof ScrollView>