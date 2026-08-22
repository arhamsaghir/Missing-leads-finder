import { useTheme as useTamaguiTheme } from '@tamagui/core'
import { useColorScheme as useRNColorScheme } from 'react-native'
import { useEffect, useState } from 'react'

type TamaguiTheme = ReturnType<typeof useTamaguiTheme> & {
  name: string
  setTheme: (name: string) => void
}

export function useTheme() {
  const theme = useTamaguiTheme() as TamaguiTheme
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const scheme = useRNColorScheme()
    setColorScheme((scheme ?? 'light') as 'light' | 'dark')
  }, [])

  return {
    theme,
    colorScheme,
    isDark: colorScheme === 'dark',
    toggleTheme: () => {
      const currentName = theme.name as string | undefined
      theme.setTheme(currentName === 'dark' ? 'light' : 'dark')
    },
    setTheme: (name: string) => theme.setTheme(name),
  }
}

export function useColorScheme(): 'light' | 'dark' {
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const scheme = useRNColorScheme()
    setColorScheme((scheme ?? 'light') as 'light' | 'dark')
  }, [])

  return colorScheme
}

export function useMedia() {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const media = {
    xs: dimensions.width <= 660,
    sm: dimensions.width <= 800,
    md: dimensions.width <= 1020,
    lg: dimensions.width <= 1280,
    xl: dimensions.width <= 1420,
    xxl: dimensions.width <= 1600,
    gtXs: dimensions.width > 660,
    gtSm: dimensions.width > 800,
    gtMd: dimensions.width > 1020,
    gtLg: dimensions.width > 1280,
    gtXl: dimensions.width > 1420,
    short: dimensions.height <= 820,
    tall: dimensions.height > 820,
    hoverNone: false,
    hover: true,
    pointerCoarse: false,
    pointerFine: true,
    reducedMotion: false,
  }

  return { media, dimensions }
}