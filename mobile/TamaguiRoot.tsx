import { TamaguiProvider } from '@tamagui/core'
import { tamaguiConfig } from '@missed-lead/ui'

export function TamaguiRoot({ children }: { children: React.ReactNode }) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      {children}
    </TamaguiProvider>
  )
}