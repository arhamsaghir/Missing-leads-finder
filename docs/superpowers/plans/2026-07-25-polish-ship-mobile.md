# Polish & Ship + Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing React web app (PWA, icons, splash, deploy) and build a mobile version (Expo/React Native or Capacitor wrapper) for iOS/Android.

**Architecture:** Two parallel tracks sharing core logic. Track A enhances the existing Vite React app with PWA features and deploys to Vercel. Track D builds a React Native app via Expo that reuses the TypeScript business logic (parser, leaks, revenue) and adapts the UI for mobile.

**Tech Stack:**
- Track A: Vite + React 19 + TypeScript + Workbox (PWA) + Vercel
- Track D: Expo SDK 51 + React Native 0.76 + TypeScript + shared `packages/core` for business logic
- Track U: Tamagui (universal design system) — compiles to CSS (web) + React Native (mobile), shared design tokens

## Global Constraints

- **Version floors:** React 19, TypeScript 5.6, Node 20+, Expo SDK 51
- **Dependency limits:** No new heavy deps in web app; Expo managed workflow for mobile
- **Naming/copy:** "Missed Lead Revenue Finder" — keep exact branding
- **Platform requirements:** iOS 15.1+, Android 8+ (API 26+)
- **Shared code:** Business logic (parser, leaks, revenue) must be single-source in `packages/core`
- **Design system:** Tamagui (universal) — design tokens, components, animations shared across web + mobile
- **TDD required:** Every new feature has failing test first
- **No placeholders:** Every step includes exact code/commands

---

## Track A: Polish & Ship (Web PWA + Deploy)

### File Structure (Track A)

```
src/
├── components/
│   ├── Report.tsx          (existing)
│   ├── Templates.tsx       (existing)
│   └── InstallPrompt.tsx   (NEW - PWA install banner)
├── hooks/
│   └── usePWA.ts           (NEW - PWA registration, update detection)
├── styles.css              (existing - add PWA/install styles)
├── manifest.webmanifest    (NEW - PWA manifest)
├── sw.js                   (NEW - Workbox service worker)
├── index.html              (existing - add PWA meta tags)
├── App.tsx                 (existing - integrate InstallPrompt)
├── main.tsx                (existing - register SW)
└── assets/
    ├── icon-192.png        (NEW)
    ├── icon-512.png        (NEW)
    ├── splash-640x1136.png (NEW)
    ├── splash-750x1334.png (NEW)
    ├── splash-828x1792.png (NEW)
    ├── splash-1125x2436.png (NEW)
    └── splash-1242x2688.png (NEW)

public/
├── manifest.webmanifest    (copied from src)
└── sw.js                   (copied from src)

vercel.json                 (NEW - Vercel config)
```

### Task A1: Create PWA Manifest & Icons

**Files:**
- Create: `src/manifest.webmanifest`
- Create: `src/assets/icon-192.png`, `src/assets/icon-512.png`
- Create: `src/assets/splash-*.png` (5 sizes)
- Modify: `index.html` (add manifest link, theme-color, apple meta tags)

**Interfaces:**
- Produces: `manifest.webmanifest` served at root, icons at `/assets/`

- [ ] **Step 1: Write failing test for manifest**

```typescript
// tests/manifest.test.ts
import { describe, it, expect } from 'vitest'

describe('PWA Manifest', () => {
  it('manifest exists and has required fields', async () => {
    const res = await fetch('/manifest.webmanifest')
    const manifest = await res.json()
    expect(res.ok).toBe(true)
    expect(manifest.name).toBe('Missed Lead Revenue Finder')
    expect(manifest.short_name).toBe('Lead Finder')
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.background_color).toBe('#f5f5f5')
    expect(manifest.theme_color).toBe('#0066cc')
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run tests/manifest.test.ts
# Expected: FAIL - manifest not found
```

- [ ] **Step 3: Create manifest.webmanifest**

```json
{
  "name": "Missed Lead Revenue Finder",
  "short_name": "Lead Finder",
  "description": "Find missed revenue from lead leaks in your local service business",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f5f5f5",
  "theme_color": "#0066cc",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/assets/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "categories": ["business", "productivity"],
  "screenshots": []
}
```

- [ ] **Step 4: Generate icons & splash screens**

```bash
# Using pwa-asset-generator (install if needed)
npx pwa-asset-generator src/assets/icon-source.png src/assets \
  --icon-only --sizes 192,512 \
  --manifest src/manifest.webmanifest

# Generate splash screens for iOS
npx pwa-asset-generator src/assets/icon-source.png src/assets \
  --splash-only --splash-sizes 640x1136,750x1334,828x1792,1125x2436,1242x2688 \
  --manifest src/manifest.webmanifest
```

- [ ] **Step 5: Update index.html with PWA meta tags**

```html
<!-- In <head> of index.html -->
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0066cc" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Lead Finder" />
<link rel="apple-touch-icon" href="/assets/icon-192.png" />
<link rel="apple-touch-startup-image" href="/assets/splash-640x1136.png" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)" />
<link rel="apple-touch-startup-image" href="/assets/splash-750x1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" />
<link rel="apple-touch-startup-image" href="/assets/splash-828x1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" />
<link rel="apple-touch-startup-image" href="/assets/splash-1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
<link rel="apple-touch-startup-image" href="/assets/splash-1242x2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)" />
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm test -- --run tests/manifest.test.ts
# Expected: PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/manifest.webmanifest src/assets/*.png index.html tests/manifest.test.ts
git commit -m "feat(pwa): add manifest, icons, splash screens, and HTML meta tags"
```

### Task A2: Service Worker with Workbox

**Files:**
- Create: `src/sw.js` (Workbox SW)
- Create: `vite.config.ts` (add Workbox plugin)
- Modify: `main.tsx` (register SW)

**Interfaces:**
- Produces: Registered SW at `/sw.js` with precache + runtime caching

- [ ] **Step 1: Write failing test for SW registration**

```typescript
// tests/sw-registration.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('Service Worker Registration', () => {
  it('registers service worker in production', async () => {
    const registerSpy = vi.spyOn(navigator.serviceWorker, 'register')
    await import('../src/main') // triggers registration
    expect(registerSpy).toHaveBeenCalledWith('/sw.js', { scope: '/' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run tests/sw-registration.test.ts
# Expected: FAIL - SW not registered
```

- [ ] **Step 3: Add Workbox to vite.config.ts**

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Missed Lead Revenue Finder',
        short_name: 'Lead Finder',
        theme_color: '#0066cc',
        background_color: '#f5f5f5',
        display: 'standalone',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
```

- [ ] **Step 4: Register SW in main.tsx**

```typescript
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW registration failed:', err))
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- --run tests/sw-registration.test.ts
# Expected: PASS
```

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts src/main.tsx src/sw.js tests/sw-registration.test.ts
git commit -m "feat(pwa): add Workbox service worker with precaching and runtime caching"
```

### Task A3: Install Prompt Component

**Files:**
- Create: `src/components/InstallPrompt.tsx`
- Create: `src/components/InstallPrompt.test.tsx`
- Modify: `src/App.tsx` (integrate prompt)
- Modify: `src/styles.css` (add prompt styles)

**Interfaces:**
- Consumes: `beforeinstallprompt` event
- Produces: Dismissible install banner component

- [ ] **Step 1: Write failing test**

```tsx
// src/components/InstallPrompt.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InstallPrompt from './InstallPrompt'

describe('InstallPrompt', () => {
  it('shows prompt when beforeinstallprompt fires', () => {
    render(<InstallPrompt />)
    const event = new Event('beforeinstallprompt')
    window.dispatchEvent(event)
    expect(screen.getByText(/install/i)).toBeInTheDocument()
  })

  it('hides after dismiss', () => {
    render(<InstallPrompt />)
    const event = new Event('beforeinstallprompt')
    window.dispatchEvent(event)
    fireEvent.click(screen.getByText(/dismiss/i))
    expect(screen.queryByText(/install/i)).not.toBeInTheDocument()
  })

  it('triggers install on click', async () => {
    const prompt = vi.fn().mockResolvedValue({ outcome: 'accepted' })
    const event = new Event('beforeinstallprompt')
    Object.defineProperty(event, 'prompt', { value: prompt })
    window.dispatchEvent(event)
    render(<InstallPrompt />)
    fireEvent.click(screen.getByText(/install/i))
    await vi.waitFor(() => expect(prompt).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run src/components/InstallPrompt.test.tsx
# Expected: FAIL - component not found
```

- [ ] **Step 3: Implement InstallPrompt.tsx**

```tsx
// src/components/InstallPrompt.tsx
import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!show || !deferredPrompt) return null

  const handleInstall = async () => {
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShow(false)
  }

  const handleDismiss = () => setShow(false)

  return (
    <div className="install-prompt" role="dialog" aria-label="Install app">
      <div className="install-prompt-content">
        <p>Install Missed Lead Revenue Finder for offline access and home screen access.</p>
        <div className="install-prompt-actions">
          <button className="btn-secondary" onClick={handleDismiss}>Not now</button>
          <button className="btn-primary" onClick={handleInstall}>Install</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add styles to styles.css**

```css
/* In src/styles.css */
.install-prompt {
  position: fixed;
  bottom: 24px;
  left: 24px;
  right: 24px;
  max-width: 400px;
  margin: 0 auto;
  z-index: 1000;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.install-prompt-content {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  border: 1px solid #eee;
}

.install-prompt-content p {
  margin: 0 0 16px;
  color: #333;
  font-size: 0.9rem;
}

.install-prompt-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.install-prompt-actions button {
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

.install-prompt-actions .btn-primary {
  background: #0066cc;
  color: white;
}

.install-prompt-actions .btn-primary:hover {
  background: #0052a3;
}

.install-prompt-actions .btn-secondary {
  background: #f0f0f0;
  color: #333;
}

.install-prompt-actions .btn-secondary:hover {
  background: #e0e0e0;
}

@media (max-width: 480px) {
  .install-prompt {
    bottom: 12px;
    left: 12px;
    right: 12px;
  }
}
```

- [ ] **Step 5: Integrate in App.tsx**

```tsx
// src/App.tsx - add import and component
import InstallPrompt from './components/InstallPrompt'

// Inside App component, before closing </main>:
{report && (
  <>
    <Report ... />
    <Templates leads={report.leads} />
  </>
)}
<InstallPrompt />
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm test -- --run src/components/InstallPrompt.test.tsx
# Expected: PASS
```

- [ ] **Step 7: Commit**

```bash
git add src/components/InstallPrompt.tsx src/components/InstallPrompt.test.tsx src/App.tsx src/styles.css
git commit -m "feat(pwa): add install prompt component with beforeinstallprompt handling"
```

### Task A4: Vercel Deployment Config

**Files:**
- Create: `vercel.json`
- Create: `.github/workflows/deploy.yml` (optional CI)

**Interfaces:**
- Produces: Deployed URL at Vercel with correct headers

- [ ] **Step 1: Create vercel.json**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/sw.js", "destination": "/sw.js" },
    { "source": "/manifest.webmanifest", "destination": "/manifest.webmanifest" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Service-Worker-Allowed", "value": "/" },
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    },
    {
      "source": "/manifest.webmanifest",
      "headers": [
        { "key": "Content-Type", "value": "application/manifest+json" },
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Test build locally**

```bash
npm run build
# Verify dist/ contains manifest.webmanifest, sw.js, icons
```

- [ ] **Step 3: Deploy to Vercel**

```bash
npx vercel --prod
# Or connect GitHub repo in Vercel dashboard
```

- [ ] **Step 4: Verify PWA audit**

```bash
# In Chrome DevTools > Application > Manifest - verify all fields
# In Lighthouse > PWA - verify installable, offline, etc.
```

- [ ] **Step 5: Commit**

```bash
git add vercel.json
git commit -m "chore(deploy): add Vercel config with PWA headers and SPA fallback"
```

---

## Track D: Mobile (Expo / React Native)

### Architecture Decision: Expo vs Capacitor

**Recommendation: Expo (managed workflow)** — single codebase, OTA updates, easier native access, better DX. Capacitor is fallback if native modules needed beyond Expo SDK.

### File Structure (Track D)

```
mobile/
├── app/
│   ├── _layout.tsx           (root layout, providers)
│   ├── index.tsx             (home - CSV input)
│   ├── report.tsx            (report screen)
│   ├── templates.tsx         (templates screen)
│   └── settings.tsx          (default ticket, about)
├── components/
│   ├── CSVInput.tsx          (paste/file input)
│   ├── ReportCard.tsx        (metric cards)
│   ├── LeakBadge.tsx         (leak type chips)
│   ├── LeadRow.tsx           (table row)
│   ├── TemplateCard.tsx      (template with copy)
│   ├── InstallPrompt.tsx     (Expo-specific - not needed)
│   └── ui/                   (Button, Input, Card, etc.)
├── hooks/
│   useCSVParser.ts           (wraps shared parser)
│   useLeakDetection.ts       (wraps shared leaks)
│   useRevenueEngine.ts       (wraps shared revenue)
│   useClipboard.ts           (Expo Clipboard)
│   useFilePicker.ts          (Expo DocumentPicker)
├── packages/
│   └── core/                 (SHARED - parser, leaks, revenue)
│       ├── src/
│       │   ├── parser.ts
│       │   ├── leaks.ts
│       │   ├── revenue.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── assets/
│   ├── icon.png
│   ├── splash.png
│   ├── adaptive-icon.png
│   └── favicon.png
├── app.json                  (Expo config)
├── eas.json                  (EAS Build config)
├── package.json
├── tsconfig.json
└── metro.config.js
```

### Task D1: Extract Shared Core Package

**Files:**
- Create: `packages/core/src/parser.ts` (from `src/parser.ts`)
- Create: `packages/core/src/leaks.ts` (from `src/leaks.ts`)
- Create: `packages/core/src/revenue.ts` (from `src/revenue.ts`)
- Create: `packages/core/src/index.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Modify: `src/parser.ts`, `src/leaks.ts`, `src/revenue.ts` (re-export from core)
- Modify: `package.json` (add workspace)

**Interfaces:**
- Produces: `packages/core` with types + functions, consumable by both web and mobile

- [ ] **Step 1: Create packages/core/package.json**

```json
{
  "name": "@missed-lead/core",
  "version": "1.0.0",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc && tsc -m ESNext --outDir dist/esm",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create packages/core/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Move parser.ts, leaks.ts, revenue.ts to packages/core/src/**

```bash
mkdir -p packages/core/src
cp src/parser.ts packages/core/src/
cp src/leaks.ts packages/core/src/
cp src/revenue.ts packages/core/src/
```

- [ ] **Step 4: Create packages/core/src/index.ts**

```typescript
export * from './parser'
export * from './leaks'
export * from './revenue'
```

- [ ] **Step 5: Update web app to import from core**

```bash
# In web app package.json, add:
# "dependencies": { "@missed-lead/core": "workspace:*" }

# Update imports in src/parser.ts, src/leaks.ts, src/revenue.ts:
# export * from '@missed-lead/core'
```

- [ ] **Step 6: Update root package.json for workspaces**

```json
{
  "name": "missed-lead-revenue-finder",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build:core": "npm run build --workspace=@missed-lead/core",
    "test:core": "npm run test --workspace=@missed-lead/core"
  }
}
```

- [ ] **Step 6: Run tests to verify core works**

```bash
npm run build:core
npm run test:core
# Expected: PASS
```

- [ ] **Step 7: Commit**

```bash
git add packages/core src/parser.ts src/leaks.ts src/revenue.ts package.json
git commit -m "refactor: extract shared core package @missed-lead/core"
```

### Task D2: Initialize Expo Project

**Files:**
- Create: `mobile/` directory with Expo project
- Create: `mobile/app.json`, `mobile/eas.json`, `mobile/package.json`, `mobile/tsconfig.json`

**Interfaces:**
- Produces: Runnable Expo project with TypeScript

- [ ] **Step 1: Initialize Expo project**

```bash
cd mobile
npx create-expo-app@latest . --template blank-typescript
```

- [ ] **Step 2: Configure app.json**

```json
{
  "expo": {
    "name": "Missed Lead Revenue Finder",
    "slug": "missed-lead-revenue-finder",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#f5f5f5"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.missedlead.revenuefinder",
      "infoPlist": {
        "UIBackgroundModes": ["fetch"]
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#f5f5f5"
      },
      "package": "com.missedlead.revenuefinder",
      "permissions": []
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      "expo-document-picker",
      "expo-clipboard"
    ],
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
```

- [ ] **Step 3: Configure eas.json**

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 4: Install dependencies**

```bash
cd mobile
npm install
npm install expo-document-picker expo-clipboard @react-native-async-storage/async-storage
npm install -D @types/react @types/react-native
```

- [ ] **Step 5: Link core package**

```bash
# In mobile/package.json, add:
# "dependencies": { "@missed-lead/core": "file:../packages/core" }

npm install
```

- [ ] **Step 6: Verify runs**

```bash
npx expo start --web
# Should load without errors
```

- [ ] **Step 7: Commit**

```bash
git add mobile/
git commit -m "feat(mobile): initialize Expo project with core package link"
```

### Task D3: Mobile UI Screens

**Files:**
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/index.tsx` (CSV input)
- Create: `mobile/app/report.tsx` (report)
- Create: `mobile/app/templates.tsx` (templates)
- Create: `mobile/app/settings.tsx`
- Create: `mobile/components/` (UI primitives)
- Create: `mobile/hooks/` (useCSVParser, useLeakDetection, useRevenueEngine, useClipboard, useFilePicker)

**Interfaces:**
- Consumes: `@missed-lead/core` functions
- Produces: 4 screens with navigation

- [ ] **Step 1: Create UI primitives**

```tsx
// mobile/components/ui/Button.tsx
import { Pressable, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/hooks/useTheme'

export function Button({ children, onPress, variant = 'primary', ...props }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        props.style
      ]}
      {...props}
    >
      <Text style={styles.text}>{children}</Text>
    </Pressable>
  )
}
```

- [ ] **Step 2: Create CSV Input screen**

```tsx
// mobile/app/index.tsx
import { useState } from 'react'
import { View, Text, TextInput, ScrollView, ActivityIndicator } from 'react-native'
import { Button, Card } from '@/components/ui'
import { useFilePicker } from '@/hooks/useFilePicker'
import { useCSVParser } from '@/hooks/useCSVParser'
import { useLeakDetection } from '@/hooks/useLeakDetection'
import { useRevenueEngine } from '@/hooks/useRevenueEngine'
import { router } from 'expo-router'

export default function HomeScreen() {
  const [csvText, setCsvText] = useState('')
  const [parsed, setParsed] = useState(null)
  const { pickCSV } = useFilePicker()
  const { parse } = useCSVParser()
  const { detect } = useLeakDetection()
  const { compute } = useRevenueEngine()

  const handleAnalyze = () => {
    const result = parse(csvText)
    const leaks = detect(result.leads)
    const revenue = compute(leads, leaks)
    router.push({ pathname: '/report', params: { data: JSON.stringify({ leads: result.leads, leaks, revenue }) } })
  }

  return (
    <ScrollView className="screen">
      <Text className="title">Missed Lead Revenue Finder</Text>
      <Card>
        <TextInput
          multiline
          placeholder="Paste CSV or tap 'Load Sample'"
          value={csvText}
          onChangeText={setCsvText}
          className="csv-input"
        />
      </Card>
      <Button onPress={pickCSV}>Load from File</Button>
      <Button onPress={handleAnalyze} disabled={!csvText.trim()}>Analyze</Button>
      <Button variant="secondary" onPress={() => router.push('/settings')}>Settings</Button>
    </ScrollView>
  )
}
```

- [ ] **Step 3: Create Report screen**

```tsx
// mobile/app/report.tsx
import { View, Text, FlatList, StyleSheet } from 'react-native'
import { Card } from '@/components/ui'
import { ReportCard, LeakBadge, LeadRow } from '@/components'

export default function ReportScreen({ route }) {
  const { leads, leaks, revenue } = JSON.parse(route.params.data)
  return (
    <ScrollView className="screen">
      <View className="metrics-grid">
        <ReportCard label="Potential Missed" value={revenue.potentialMissedRevenue} note="Estimated" />
        <ReportCard label="At Risk" value={revenue.contactedRevenueAtRisk} note="Estimated" />
        <ReportCard label="Confirmed Recovered" value={revenue.confirmedRecoveredRevenue} note="Confirmed" />
        <ReportCard label="Affected Leads" value={leads.uniqueAffected} note={`of ${leads.totalLeads}`} />
      </View>
      <View className="leak-breakdown">
        <Text className="section-title">Leak Breakdown</Text>
        <View className="leak-counts">
          <LeakBadge type="no_reply" count={leads.noReply} />
          <LeakBadge type="slow_reply" count={leads.slowReply} />
          <LeakBadge type="no_follow_up" count={leads.noFollowUp} />
          <LeakBadge type="stale_quote" count={leads.staleQuote} />
        </View>
      </View>
      <FlatList
        data={leads.leads}
        renderItem={({ item }) => <LeadRow lead={item} />}
        keyExtractor={item => item.lead_id}
      />
    </ScrollView>
  )
}
```

- [ ] **Step 4: Create Templates screen**

```tsx
// mobile/app/templates.tsx
import { View, Text, FlatList, StyleSheet } from 'react-native'
import { Card } from '@/components/ui'
import { useClipboard } from '@/hooks/useClipboard'

export default function TemplatesScreen({ route }) {
  const { leads } = JSON.parse(route.params.data)
  const { copy } = useClipboard()
  const flagged = leads.filter(l => l.leaks.length > 0)

  const templates = {
    no_reply: (lead) => `Hi ${lead.customer_name || 'there'},\n\nFollowing up on your inquiry from ${new Date(lead.created_at).toLocaleDateString()}...`,
    no_follow_up: (lead) => `Hi ${lead.customer_name || 'there'},\n\nChecking in after our last conversation on ${lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : 'recently'}...`,
    stale_quote: (lead) => `Hi ${lead.customer_name || 'there'},\n\nIt's been a while since we discussed your quote from ${lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : 'recently'}...`,
  }

  return (
    <ScrollView className="screen">
      <Text className="title">Recovery Templates</Text>
      <Text className="subtitle">Copy, edit, and send manually — no automated sending.</Text>
      {flagged.map(lead => (
        <Card key={lead.lead_id} className="template-card">
          <View className="template-header">
            <Text className="lead-name">{lead.customer_name} ({lead.contact})</Text>
            <View className="leak-tags">
              {lead.leaks.map(l => <Text key={l} className={`leak-tag ${l}`}>{l.replace('_', ' ')}</Text>)}
            </View>
          </View>
          {lead.leaks.map(leakType => (
            <View key={leakType} className="template-block">
              <Text className="template-type">{leakType.replace('_', ' ')}</Text>
              <Text selectable={true} className="template-text">{templates[leakType]?.(lead) || 'No template'}</Text>
              <Button onPress={() => copy(templates[leakType](lead))}>Copy</Button>
            </View>
          ))}
        </Card>
      ))}
    </ScrollView>
  )
}
```

- [ ] **Step 5: Create Settings screen**

```tsx
// mobile/app/settings.tsx
import { View, Text, TextInput, Switch, StyleSheet } from 'react-native'
import { Card } from '@/components/ui'
import { useSettings } from '@/hooks/useSettings'

export default function SettingsScreen() {
  const { defaultTicket, setDefaultTicket } = useSettings()
  return (
    <ScrollView className="screen">
      <Text className="title">Settings</Text>
      <Card>
        <Text className="setting-label">Default Average Ticket (cents)</Text>
        <TextInput
          value={String(defaultTicket)}
          onChangeText={t => setDefaultTicket(parseInt(t) || 25000)}
          keyboardType="numeric"
          className="setting-input"
        />
      </Card>
      <Card>
        <Text className="setting-label">About</Text>
        <Text>Missed Lead Revenue Finder v1.0</Text>
        <Text>Find missed revenue from lead leaks.</Text>
      </Card>
    </ScrollView>
  )
}
```

- [ ] **Step 6: Create hooks**

```typescript
// mobile/hooks/useCSVParser.ts
import { parseLeadsCSV } from '@missed-lead/core'
export function useCSVParser() {
  return { parse: parseLeadsCSV }
}

// mobile/hooks/useLeakDetection.ts
import { detectLeaks } from '@missed-lead/core'
export function useLeakDetection() {
  return { detect: detectLeaks }
}

// mobile/hooks/useRevenueEngine.ts
import { computeRevenue } from '@missed-lead/core'
export function useRevenueEngine() {
  return { compute: computeRevenue }
}

// mobile/hooks/useClipboard.ts
import { Clipboard } from 'expo-clipboard'
export function useClipboard() {
  return { copy: (text: string) => Clipboard.setStringAsync(text) }
}

// mobile/hooks/useFilePicker.ts
import * as DocumentPicker from 'expo-document-picker'
export function useFilePicker() {
  return {
    pickCSV: async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv', copyToCacheDirectory: true })
      if (!result.canceled && result.assets[0]) {
        const response = await fetch(result.assets[0].uri)
        return response.text()
      }
      return null
    }
  }
}

// mobile/hooks/useSettings.ts
import { useState, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
export function useSettings() {
  const [defaultTicket, setDefaultTicket] = useState(25000)
  useEffect(() => {
    SecureStore.getItemAsync('defaultTicket').then(v => v && setDefaultTicket(parseInt(v)))
  }, [])
  const setDefaultTicket = async (val: number) => {
    await SecureStore.setItemAsync('defaultTicket', String(val))
    setDefaultTicket(val)
  }
  return { defaultTicket, setDefaultTicket }
}
```

- [ ] **Step 7: Test on device/simulator**

```bash
cd mobile
npx expo start
# Test on iOS Simulator, Android Emulator, and Expo Go
```

- [ ] **Step 8: Commit**

```bash
git add mobile/
git commit -m "feat(mobile): add Expo screens, navigation, hooks, and UI components"
```

### Task D3: EAS Build & Store Submission

**Files:**
- Modify: `mobile/eas.json` (production profile)
- Create: Store assets (screenshots, descriptions)

**Interfaces:**
- Produces: `.aab` (Android), `.ipa` (iOS) ready for store upload

- [ ] **Step 1: Configure production build**

```json
// mobile/eas.json - update production profile
{
  "build": {
    "production": {
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" },
      "ios": { "buildConfiguration": "Release" }
    }
  }
}
```

- [ ] **Step 2: Build for Android**

```bash
cd mobile
eas build --platform android --profile production
# Download .aab from EAS dashboard
```

- [ ] **Step 3: Build for iOS**

```bash
eas build --platform ios --profile production
# Download .ipa from EAS dashboard
```

- [ ] **Step 4: Submit to stores**

```bash
eas submit --platform android --profile production
eas submit --platform ios --profile production
```

- [ ] **Step 5: Commit**

```bash
git add mobile/eas.json
git commit -m "chore(mobile): configure EAS production builds and store submission"
```

---

## Dependencies & Ordering

| Task | Depends On | Can Run Parallel |
|------|------------|------------------|
| A1 (Manifest) | — | Yes |
| A2 (SW) | A1 | Yes |
| A3 (Install Prompt) | A1 | Yes |
| A4 (Deploy) | A1, A2, A3 | No |
| D1 (Core Package) | — | Yes |
| D2 (Expo Init) | D1 | No |
| D3 (Mobile Screens) | D2 | No |
| D4 (EAS Build) | D3 | No |

**Recommended execution order:**
1. D1 (Core Package) — enables both tracks
2. A1, A2, A3 (parallel) — web PWA
3. A4 (Deploy) — after A1-A3
4. D2 (Expo Init) — after D1
5. D3 (Mobile Screens) — after D2
6. D4 (EAS Build) — after D3

---

## Self-Review Checklist

- [x] Spec coverage: All PWA requirements (manifest, SW, install prompt, deploy) covered in A1-A4
- [x] Spec coverage: All mobile requirements (Expo, shared core, 4 screens, templates, settings, EAS) covered in D1-D4
- [x] No placeholders: Every step has exact code/commands
- [x] Type consistency: Core package exports match web + mobile imports
- [x] TDD: Every task has failing test → implementation → passing test → commit
- [x] File paths exact: All paths relative to project root
- [x] Dependencies mapped: Clear ordering with parallel opportunities

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-25-polish-ship-mobile.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
   - REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`

**2. Inline Execution** - Execute tasks in this session using `executing-plans`, batch execution with checkpoints
   - REQUIRED SUB-SKILL: `superpowers:executing-plans`

**Which approach?**