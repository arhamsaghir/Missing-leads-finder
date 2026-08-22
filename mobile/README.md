# Missed Lead Revenue Finder - Mobile App

React Native app built with Expo SDK 51 and Tamagui design system.

## Quick Start

```bash
cd mobile
npm install
npm run start
```

## EAS Build Setup

### Prerequisites
1. Expo account: `npx eas-cli login`
2. EAS project: `npx eas-cli init` (run in mobile/ directory)

### Build Commands

```bash
# Development build (for testing on device)
npx eas-cli build --profile development --platform all

# Preview build (internal distribution)
npx eas-cli build --profile preview --platform all

# Production build (App Store / Play Store)
npx eas-cli build --profile production --platform all
```

### Submit to Stores

```bash
# Submit to App Store
npx eas-cli submit --profile production --platform ios

# Submit to Play Store
npx eas-cli submit --profile production --platform android
```

## Configuration Files

- `app.json` - Expo app configuration
- `eas.json` - EAS build profiles
- `tamagui.config.ts` - Tamagui design system config

## Project Structure

```
mobile/
├── src/
│   ├── screens/       # 4 main screens
│   │   ├── InputScreen.tsx
│   │   ├── ReportScreen.tsx
│   │   ├── TemplatesScreen.tsx
│   │   └── SettingsScreen.tsx
│   ├── hooks/         # Custom hooks
│   │   └── useLeadAnalysis.ts
│   └── components/    # Shared components
├── App.tsx            # Main app with tab navigation
├── TamaguiRoot.tsx    # Tamagui provider
├── tamagui.config.ts  # Design system config
└── app.json           # Expo config
```

## Screens

1. **InputScreen** - CSV paste/upload, sample data, analyze button
2. **ReportScreen** - Revenue leak report with 3 money cards, metrics grid, lead table
3. **TemplatesScreen** - Recovery templates for each leak type (copy-only)
4. **SettingsScreen** - Default ticket, auto-analyze, dark mode, privacy info

## Dependencies

- Expo SDK 51
- React Native 0.86
- Tamagui 2.5 (design system)
- @missed-lead/core (shared business logic)
- react-native-reanimated, react-native-gesture-handler

## Environment Variables

Create `.env` file for production:
```
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
```

## Notes

- All analysis runs locally on device (no server needed)
- Data privacy: no data leaves the device
- Works offline after initial load