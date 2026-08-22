import { styled, View } from '@tamagui/core'

export const Box = styled(View, {
  name: 'Box',
  variants: {
    flex: {
      true: { flex: 1 },
    },
    row: {
      true: { flexDirection: 'row' },
    },
    column: {
      true: { flexDirection: 'column' },
    },
    center: {
      true: { alignItems: 'center', justifyContent: 'center' },
    },
    spaceBetween: {
      true: { justifyContent: 'space-between' },
    },
    spaceAround: {
      true: { justifyContent: 'space-around' },
    },
    wrap: {
      true: { flexWrap: 'wrap' },
    },
    grow: {
      true: { flexGrow: 1 },
    },
    shrink: {
      true: { flexShrink: 1 },
    },
    absolute: {
      true: { position: 'absolute' },
    },
    relative: {
      true: { position: 'relative' },
    },
    full: {
      true: { width: '100%', height: '100%' },
    },
    fullWidth: {
      true: { width: '100%' },
    },
    fullHeight: {
      true: { height: '100%' },
    },
  },
})

export type BoxProps = React.ComponentProps<typeof Box>