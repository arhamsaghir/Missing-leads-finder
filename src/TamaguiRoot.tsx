import { TamaguiProvider } from '@tamagui/core'
import config from '../tamagui.config'

export function TamaguiRoot({ children }: { children: React.ReactNode }) {
  return (
    <TamaguiProvider config={config} defaultTheme="light">
      {children}
    </TamaguiProvider>
  )
}