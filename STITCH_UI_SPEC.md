# Missed Lead Revenue Finder — Complete UI/UX Specification for Google Stitch Reconstruction

## 1. App Overview

**Name:** Missed Lead Revenue Finder
**Purpose:** A local-first audit tool for small service businesses to find missed revenue from lead leaks. Paste a CSV of leads → get an instant revenue leak report with recovery message templates.
**Platform:** React Native (Expo SDK 57), iOS + Android
**Design System:** Tamagui 1.144.4 with custom token-based theming
**Orientation:** Portrait only
**Offline:** 100% local processing — no server, no network calls, no data leaves device

---

## 2. App Architecture & Navigation

### 2.1 Navigation Pattern
- **Bottom tab bar** with 4 tabs (fixed at bottom of screen)
- **No stack navigation** — tabs swap screen content in-place
- Tabs are button-like, with icon + label
- Report and Templates tabs are **disabled** until an analysis has been run
- Active tab uses `variant="primary"` (blue background); inactive tabs use `variant="ghost"` (transparent)

### 2.2 Tabs

| Tab ID | Label | Icon | Enabled When |
|--------|-------|------|-------------|
| `input` | Analyze | 📊 | Always |
| `report` | Report | 📈 | After analysis completes |
| `templates` | Templates | 📝 | After analysis completes |
| `settings` | Settings | ⚙️ | Always |

### 2.3 Screen Switching Logic
```
if activeTab === 'input' → show InputScreen
if activeTab === 'report' && report exists → show ReportScreen
if activeTab === 'report' && no report → show empty state ("No report yet...")
if activeTab === 'templates' && report exists → show TemplatesScreen
if activeTab === 'templates' && no report → show empty state ("No templates yet...")
if activeTab === 'settings' → show SettingsScreen
```

### 2.4 Header
- Fixed header at top: "Missed Lead Revenue Finder" (heading4, bold)
- Padding: 16px all sides
- Bottom border: 1px, theme borderColor
- Background: theme background (white in light mode)

### 2.5 Root Layout
```
TamaguiRoot (theme provider)
  └── Box (flex=1, backgroundColor=$background)
       └── StatusBar (auto)
       └── Box (flex=1, flexDirection=column)
            ├── Header Box (padding=16, borderBottomWidth=1)
            ├── Content Box (flex=1, flexDirection=column) → active screen
            └── TabBar Box (borderTopWidth=1, backgroundColor=#FFFFFF, paddingBottom=48)
```

---

## 3. Design System — Complete Token Reference

### 3.1 Color Palette — Light Theme

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#ffffff` | Page/Card background |
| `backgroundHover` | `#f4f4f5` | Hover state for backgrounds |
| `backgroundPress` | `#e4e4e7` | Press state for backgrounds |
| `borderColor` | `#d4d4d8` | Default borders |
| `borderColorHover` | `#a1a1aa` | Hover borders |
| `borderColorFocus` | `#0066cc` | Focus borders |
| `color` | `#18181b` | Primary text color |
| `colorHover` | `#09090b` | Hover text |
| `colorPress` | `#030303` | Press text |
| `colorMuted` | `#71717a` | Muted/secondary text |
| `colorInverse` | `#ffffff` | Inverse text (on colored bg) |
| `placeholderColor` | `#a1a1aa` | Input placeholder text |
| `shadowColor` | `#000000` | Shadows |
| `primary` | `#0066cc` | Primary actions, active tab |
| `primaryHover` | `#0052a3` | Primary hover |
| `primaryPress` | `#004080` | Primary press |
| `primaryFocus` | `#3385d6` | Primary focus |
| `primaryBackground` | `#eff6ff` | Primary tinted bg |
| `primaryBackgroundHover` | `#dbeafe` | Primary bg hover |
| `primaryBackgroundPress` | `#bfdbfe` | Primary bg press |
| `primaryBorder` | `#93c5fd` | Primary border tint |
| `success` | `#10b981` | Success states, recovered revenue |
| `successHover` | `#059669` | Success hover |
| `successPress` | `#047857` | Success press |
| `successBackground` | `#ecfdf5` | Success tinted bg |
| `successBackgroundHover` | `#d1fae5` | Success bg hover |
| `successBackgroundPress` | `#a7f3d0` | Success bg press |
| `successBorder` | `#6ee7b7` | Success border |
| `warning` | `#f59e0b` | Warning states, stale quotes |
| `warningHover` | `#d97706` | Warning hover |
| `warningPress` | `#b45309` | Warning press |
| `warningBackground` | `#fffbeb` | Warning tinted bg |
| `warningBackgroundHover` | `#fef3c7` | Warning bg hover |
| `warningBackgroundPress` | `#fde68a` | Warning bg press |
| `warningBorder` | `#fcd34d` | Warning border |
| `error` | `#ef4444` | Error states, missed revenue |
| `errorHover` | `#dc2626` | Error hover |
| `errorPress` | `#b91c1c` | Error press |
| `errorBackground` | `#fef2f2` | Error tinted bg |
| `errorBackgroundHover` | `#fee2e2` | Error bg hover |
| `errorBackgroundPress` | `#fecaca` | Error bg press |
| `errorBorder` | `#fca5a5` | Error border |

### 3.2 Color Palette — Dark Theme

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#09090b` | Page/Card background |
| `backgroundHover` | `#18181b` | Hover state |
| `backgroundPress` | `#27272a` | Press state |
| `borderColor` | `#3f3f46` | Default borders |
| `borderColorHover` | `#52525b` | Hover borders |
| `color` | `#fafafa` | Primary text |
| `colorMuted` | `#a1a1aa` | Muted text |
| `colorInverse` | `#09090b` | Inverse text |
| `placeholderColor` | `#71717a` | Placeholder |
| `primary` | `#3385d6` | Primary actions |
| `primaryBackground` | `#1e3a5f` | Primary tinted bg |
| `primaryBorder` | `#1e40af` | Primary border |
| `success` | `#34d399` | Success |
| `successBackground` | `#064e3b` | Success tinted bg |
| `successBorder` | `#047857` | Success border |
| `warning` | `#fbbf24` | Warning |
| `warningBackground` | `#78350f` | Warning tinted bg |
| `warningBorder` | `#92400e` | Warning border |
| `error` | `#f87171` | Error |
| `errorBackground` | `#7f1d1d` | Error tinted bg |
| `errorBorder` | `#991b1b` | Error border |

### 3.3 Neutral Color Scale (Raw Tokens)

| Token | Hex |
|-------|-----|
| `neutral0` | `#ffffff` |
| `neutral1` | `#fafafa` |
| `neutral2` | `#f4f4f5` |
| `neutral3` | `#e4e4e7` |
| `neutral4` | `#d4d4d8` |
| `neutral5` | `#a1a1aa` |
| `neutral6` | `#71717a` |
| `neutral7` | `#52525b` |
| `neutral8` | `#3f3f46` |
| `neutral9` | `#27272a` |
| `neutral10` | `#18181b` |
| `neutral11` | `#09090b` |
| `neutral12` | `#030303` |

### 3.4 Raw Color Tokens

| Token | Hex |
|-------|-----|
| `primary` | `#0066cc` |
| `primaryHover` | `#0052a3` |
| `primaryPress` | `#004080` |
| `primaryFocus` | `#3385d6` |
| `success` | `#10b981` |
| `successHover` | `#059669` |
| `successPress` | `#047857` |
| `warning` | `#f59e0b` |
| `warningHover` | `#d97706` |
| `warningPress` | `#b45309` |
| `error` | `#ef4444` |
| `errorHover` | `#dc2626` |
| `errorPress` | `#b91c1c` |
| `white` | `#ffffff` |
| `black` | `#000000` |

### 3.5 Typography Scale

**Font families:**
- Heading: `Inter` (system fallback: `'System'`)
- Body: `Inter` (system fallback: `'System'`)
- Mono: `JetBrains Mono` (system fallback: `'System'`)

**Font size tokens:**

| Token | Size (px) |
|-------|-----------|
| 1 | 11 |
| 2 | 12 |
| 3 | 13 |
| 4 | 14 |
| 5 | 15 |
| 6 | 16 |
| 7 | 18 |
| 8 | 20 |
| 9 | 24 |
| 10 | 30 |
| 11 | 36 |
| 12 | 48 |
| 13 | 60 |
| 14 | 72 |

**Line height tokens:**

| Token | Height (px) |
|-------|-------------|
| 1 | 16 |
| 2 | 18 |
| 3 | 20 |
| 4 | 22 |
| 5 | 24 |
| 6 | 26 |
| 7 | 28 |
| 8 | 32 |
| 9 | 36 |
| 10 | 40 |
| 11 | 44 |
| 12 | 56 |
| 13 | 68 |
| 14 | 80 |

**Font weight tokens:**

| Token | Weight |
|-------|--------|
| 1 | 300 (light) |
| 2 | 400 (normal) |
| 3 | 500 (medium) |
| 4 | 600 (semibold) |
| 5 | 700 (bold) |
| 6 | 800 |
| 7 | 900 |

**Letter spacing tokens:**

| Token | Value (px) |
|-------|------------|
| 1 | -0.5 |
| 2 | -0.25 |
| 3 | 0 |
| 4 | 0.25 |
| 5 | 0.5 |

### 3.6 Typography Variants (Text Component)

| Variant | Font Size | Font Weight | Line Height | Letter Spacing | Extra |
|---------|-----------|-------------|--------------|-----------------|-------|
| `heading1` | 48 | 700 | 56 | -0.5 | — |
| `heading2` | 36 | 700 | 44 | -0.25 | — |
| `heading3` | 30 | 600 | 38 | -0.25 | — |
| `heading4` | 24 | 600 | 32 | 0 | — |
| `heading5` | 20 | 600 | 28 | 0 | — |
| `heading6` | 18 | 600 | 26 | 0 | — |
| `body1` | 16 | 400 | 24 | 0 | — |
| `body2` | 14 | 400 | 22 | 0 | — |
| `body3` | 13 | 400 | 20 | 0 | — |
| `caption` | 12 | 400 | 18 | 0.25 | — |
| `overline` | 11 | 500 | 16 | 0.5 | textTransform: uppercase |
| `code` | 13 | 400 | 20 | 0 | fontFamily: $mono |
| `link` | 14 | 500 | 22 | 0 | color: $primary, textDecorationLine: underline |

**Text color variants:** `default` ($color), `muted` ($colorMuted), `inverse` ($colorInverse), `primary` ($primary), `success` ($success), `warning` ($warning), `error` ($error)

**Text weight overrides:** `light` (300), `normal` (400), `medium` (500), `semibold` (600), `bold` (700)

**Text alignment:** `left`, `center`, `right`, `justify`

**Default Text variant:** `body1`, color `default`, align `left`, weight `normal`

### 3.7 Spacing & Size Tokens

| Token | Value (px) |
|-------|------------|
| 0 | 0 |
| 0.5 | 2 |
| 1 | 4 |
| 1.5 | 6 |
| 2 | 8 |
| 2.5 | 10 |
| 3 | 12 |
| 3.5 | 14 |
| 4 | 16 |
| 5 | 20 |
| 6 | 24 |
| 7 | 28 |
| 8 | 32 |
| 9 | 36 |
| 10 | 40 |
| 12 | 48 |
| 14 | 56 |
| 16 | 64 |
| 20 | 80 |
| 24 | 96 |

**Named spacing used in code:**
- `sm` = 12
- `md` = 16
- `lg` = 24
- `xl` = 32

### 3.8 Border Radius Tokens

| Token | Value (px) |
|-------|------------|
| 0 | 0 |
| 1 | 4 |
| 2 | 6 |
| 3 | 8 |
| 4 | 10 |
| 5 | 12 |
| 6 | 16 |
| 7 | 20 |
| 8 | 24 |
| 9 | 28 |
| 10 | 32 |
| full | 9999 |

**Named radius used in code:**
- `sm` = 6
- `md` = 10
- `lg` = 14
- `xl` = 18

### 3.9 Z-Index Tokens

| Token | Value |
|-------|-------|
| 0 | 0 |
| 1 | 100 |
| 2 | 200 |
| 3 | 300 |
| 4 | 400 |
| 5 | 500 |
| modal | 1000 |
| toast | 1100 |
| tooltip | 1200 |

### 3.10 Media Query Breakpoints

| Name | Query |
|------|-------|
| `xs` | maxWidth: 660 |
| `sm` | maxWidth: 800 |
| `md` | maxWidth: 1020 |
| `lg` | maxWidth: 1280 |
| `xl` | maxWidth: 1420 |
| `xxl` | maxWidth: 1600 |
| `gtXs` | minWidth: 661 |
| `gtSm` | minWidth: 801 |
| `gtMd` | minWidth: 1021 |
| `gtLg` | minWidth: 1281 |
| `gtXl` | minWidth: 1421 |
| `short` | maxHeight: 820 |
| `tall` | minHeight: 821 |

---

## 4. Component Library — Complete Reference

### 4.1 Box (layout container, styled View)

| Variant | Prop Value | Styles |
|---------|-----------|--------|
| flex | `true` | `flex: 1` |
| row | `true` | `flexDirection: 'row'` |
| column | `true` | `flexDirection: 'column'` |
| center | `true` | `alignItems: 'center', justifyContent: 'center'` |
| spaceBetween | `true` | `justifyContent: 'space-between'` |
| spaceAround | `true` | `justifyContent: 'space-around'` |
| wrap | `true` | `flexWrap: 'wrap'` |
| grow | `true` | `flexGrow: 1` |
| shrink | `true` | `flexShrink: 1` |
| absolute | `true` | `position: 'absolute'` |
| relative | `true` | `position: 'relative'` |
| full | `true` | `width: '100%', height: '100%'` |
| fullWidth | `true` | `width: '100%'` |
| fullHeight | `true` | `height: '100%'` |

Box also accepts all standard Tamagui style props: padding, margin, backgroundColor, borderWidth, borderColor, borderRadius, gap, alignItems, justifyContent, flexDirection, flex, minWidth, maxWidth, display, etc.

### 4.2 Text (styled Text)

**Variants:** heading1–heading6, body1–body3, caption, overline, code, link (see Typography Variants table above)

**Color variants:** default, muted, inverse, primary, success, warning, error

**Weight overrides:** light, normal, medium, semibold, bold

**Align:** left, center, right, justify

**Special:** `truncate={true}` → overflow hidden + ellipsis; `mono={true}` → fontFamily $mono

**Defaults:** variant=body1, color=default, align=left, weight=normal

### 4.3 Button (styled View, NOT a pressable — wrapping container)

| Variant | Background | Border Color | Text Color (ButtonText) |
|---------|-----------|-------------|--------------------------|
| `primary` | $primary (#0066cc) | $primary | $colorInverse (white) |
| `secondary` | $background (white) | $borderColor | $color (dark text) |
| `outline` | transparent | $primary | $primary |
| `ghost` | transparent | transparent | $primary |
| `destructive` | $error (#ef4444) | $error | $colorInverse (white) |
| `success` | $success (#10b981) | $success | $colorInverse (white) |

**Button sizes:**

| Size | Height | PaddingX | Border Radius | ButtonText Font Size |
|------|--------|----------|---------------|---------------------|
| `sm` | 32 | 12 | 6 | 13 |
| `md` | 40 | 16 | 8 | 14 |
| `lg` | 48 | 24 | 10 | 16 |
| `xl` | 56 | 32 | 12 | 18 |

**Button special props:**
- `fullWidth={true}` → width 100%
- `disabled={true}` → opacity 0.5, pointerEvents none
- `loading={true}` → opacity 0.7

**Defaults:** variant=primary, size=md

> **IMPORTANT:** Button is a styled `View`, not a `Pressable`. It wraps `ButtonText` (styled `Text`) as children. In the app, Button's `onPress` is used but the text is always wrapped in `<ButtonText>`.

### 4.4 ButtonText (styled Text, goes inside Button)

**Variant colors:** same as Button variants — primary ($colorInverse), secondary ($color), outline ($primary), ghost ($primary), destructive ($colorInverse), success ($colorInverse)

**Sizes:** sm (13px), md (14px), lg (16px), xl (18px)

**Defaults:** variant=primary, size=md

### 4.5 Card (styled View, container for grouped content)

| Variant | Background | Border | Shadow |
|---------|-----------|--------|--------|
| `elevated` (default) | $background | none | shadowColor $shadowColor, offset {0,2}, opacity 0.1, radius 8, elevation 3 |
| `outlined` | $background | 1px solid $borderColor | none |
| `filled` | $backgroundHover | none | none |
| `ghost` | transparent | none | none |

**Padding options:** none (0), sm (12), md (16), lg (24), xl (32)

**Radius options:** none (0), sm (6), md (10), lg (14), xl (18), full (9999)

**Hoverable={true}:** translateY(-2) on hover + stronger shadow, 150ms ease transition

**Defaults:** variant=elevated, padding=md, radius=md

### 4.6 Badge (styled View, small status indicator)

| Variant | Background | Border Color | Border Width |
|---------|-----------|-------------|-------------|
| `default` | $background | $borderColor | 1 |
| `primary` | $primaryBackground | $primaryBorder | 1 |
| `success` | $successBackground | $successBorder | 1 |
| `warning` | $warningBackground | $warningBorder | 1 |
| `error` | $errorBackground | $errorBorder | 1 |
| `outline` | transparent | $borderColor | 1 |

**Badge sizes:**

| Size | Height | PaddingX | Border Radius | Gap | BadgeText Font Size |
|------|--------|----------|---------------|-----|---------------------|
| `sm` | 20 | 8 | 10 | 4 | 11 |
| `md` | 24 | 10 | 12 | 6 | 12 |
| `lg` | 28 | 12 | 14 | 8 | 13 |

**Badge special:** `dot={true}` → flexDirection row, alignItems center

**Defaults:** variant=default, size=md

### 4.7 BadgeText (styled Text, goes inside Badge)

- Only has `size` variant: sm (11), md (12), lg (13)
- Inherits Text component's default properties

### 4.8 ScrollView (styled ScrollView)
- Custom ScrollView component exported from `@missed-lead/ui`
- Used with `flex={1}`, `padding`, and `showsScrollIndicator={false}` throughout

---

## 5. Screen-by-Screen UI Specification

### 5.1 Screen 1: InputScreen (Analyze Tab)

**Purpose:** Paste CSV data, set default ticket size, run analysis

**Layout:** Vertical scroll (ScrollView, flex=1, padding=24px)

**Elements (top to bottom):**

#### 5.1.1 CSV Text Input
- **Component:** React Native `TextInput` (multiline)
- **Placeholder:** "lead_id,created_at,customer_name,contact,source,status,last_contact_at,next_follow_up_at,estimated_value,notes\nL1,2024-01-01,John Doe,john@example.com,Web,new,,,50000,Interested"
- **Style:** fontFamily monospace, fontSize 13, padding 12, borderWidth 1, borderColor #e5e7eb, borderRadius 8, backgroundColor #fff
- **Props:** multiline, numberOfLines=8
- **Value:** `csvText` (from state)
- **onChange:** `onCsvTextChange`

#### 5.1.2 Button Row
- **Layout:** flexDirection row, gap 8
- **Buttons:**
  1. **"Load sample"** — Button variant=secondary, onPress=onLoadSample, disabled when isLoading
     - ButtonText variant=secondary → text "Load sample"
  2. **"Analyze"** — Button variant=primary, onPress=onAnalyze, disabled when isLoading
     - ButtonText variant=primary → text "Analyzing..." when loading, "Analyze" when not

#### 5.1.3 Default Ticket Input Row
- **Layout:** flexDirection row, gap 12, marginTop 16, alignItems flex-end, flexWrap wrap
- **Contains:**
  - Box (flex=1, minWidth=200):
    - Text variant=body3, color=muted, marginBottom=4, display=block: "Default average ticket (cents)"
    - TextInput (numeric keyboard):
      - Value: String(defaultTicket) — default 25000
      - onChangeText: parseInt || 25000
      - Style: padding 12, borderWidth 1, borderColor #e5e7eb, borderRadius 8, backgroundColor #fff

#### 5.1.4 Errors & Warnings (conditional)
- **Condition:** errors.length > 0 OR warnings.length > 0
- **Layout:** marginTop 16, flexDirection column, gap 8
- **Error badges:** Badge variant=error, size=md → BadgeText size=md → error message text
- **Warning badges:** Badge variant=warning, size=md → BadgeText size=md → warning message text

---

### 5.2 Screen 2: ReportScreen (Report Tab)

**Purpose:** Display revenue leak analysis results

**Props:** `summary` (LeakSummary), `revenue` (RevenueSummary), `leads` (LeadWithLeaks[])

**Layout:** Vertical scroll (ScrollView, flex=1, padding=lg/24px)

**Elements (top to bottom):**

#### 5.2.1 Screen Title
- Text variant=heading4, weight=bold, marginBottom=lg: "Revenue Leak Report"

#### 5.2.2 Revenue Cards Row (3 cards)
- **Layout:** flexDirection row, flexWrap wrap, gap md (16), marginBottom xl (32)
- **Card 1 — Potential Missed Revenue:**
  - Card variant=outlined, padding=lg (24)
  - Text variant=body3, color=muted, marginBottom=sm, display=block: "Potential Missed Revenue"
  - Text variant=heading3, weight=bold, color=error: `{formatCurrency(revenue.potentialMissedRevenue)}`
  - Text variant=caption, color=muted: "Estimated"
- **Card 2 — Contacted Revenue at Risk:**
  - Card variant=outlined, padding=lg (24)
  - Text variant=body3, color=muted, marginBottom=sm, display=block: "Contacted Revenue at Risk"
  - Text variant=heading3, weight=bold, color=warning: `{formatCurrency(revenue.contactedRevenueAtRisk)}`
  - Text variant=caption, color=muted: "Estimated"
- **Card 3 — Confirmed Recovered Revenue:**
  - Card variant=outlined, padding=lg (24)
  - Text variant=body3, color=muted, marginBottom=sm, display=block: "Confirmed Recovered Revenue"
  - Text variant=heading3, weight=bold, color=success: `{formatCurrency(revenue.confirmedRecoveredRevenue)}`
  - Text variant=caption, color=muted: "Confirmed"

#### 5.2.3 Metrics Grid (5 cards)
- **Layout:** flexDirection row, flexWrap wrap, gap md (16), marginBottom xl (32)
- **Each card:** variant=outlined, padding=md (16), alignItems=center, flex=1, minWidth=140

| Card | Big Number | Number Color | Label |
|------|-----------|-------------|-------|
| 1 | `summary.uniqueAffected` | default (no color prop) | "Unique Affected Leads" |
| 2 | `summary.noReply` | error (#ef4444) | "No Reply" |
| 3 | `summary.slowReply` | warning (#f59e0b) | "Slow Reply (>24h)" |
| 4 | `summary.noFollowUp` | primary (#0066cc) | "No Follow-up" |
| 5 | `summary.staleQuote` | warning (#f59e0b) | "Stale Quote (>7d)" |

- Big number: Text variant=heading2, weight=bold
- Label: Text variant=caption, color=muted, textAlign=center

#### 5.2.4 Lead Details Table
- **Section title:** Text variant=heading5, weight=semibold, marginBottom=md: "Lead Details"
- **Table container:** Box borderWidth=1, borderColor=$borderColor, borderRadius=lg (14), overflow=hidden

**Table Header Row:**
- Box flexDirection=row, backgroundColor=$backgroundSecondary, borderBottomWidth=1, borderColor=$borderColor, padding=md
- Columns (all Text variant=caption, weight=bold):

| Column | Width | Label |
|--------|------|-------|
| 1 | 15% | "ID" |
| 2 | 20% | "Customer" |
| 3 | 20% | "Contact" |
| 4 | 15% | "Source" |
| 5 | 15% | "Status" |
| 6 | 15% | "Value" |

**Table Body Rows (one per lead):**
- Box flexDirection=row, borderBottomWidth=1, borderColor=$borderColor, padding=md
- Column 1: Text variant=caption, width=15%: lead.lead_id
- Column 2: Text variant=caption, width=20%: lead.customer_name
- Column 3: Text variant=caption, width=20%: lead.contact
- Column 4: Text variant=caption, width=15%: lead.source
- Column 5: Box width=15%, alignItems=center → Badge (variant by status color map, size=sm) → BadgeText size=sm: lead.status
- Column 6: Text variant=caption, width=15%: formatCurrency(lead.estimated_value)

**Status color mapping:**

| Status | Badge Variant |
|--------|--------------|
| `new` | default |
| `contacted` | primary |
| `qualified` | warning |
| `booked` | success |
| `lost` | error |
| `recovered` | success |
| `won` | success |

---

### 5.3 Screen 3: TemplatesScreen (Templates Tab)

**Purpose:** Show copy-paste recovery message templates for each flagged lead

**Props:** `leads` (LeadWithLeaks[])

**Logic:** Filter to only leads with `leaks.length > 0`; if none, return null (render nothing)

**Layout:** Vertical scroll (ScrollView, flex=1, padding=lg/24px)

**Elements (top to bottom):**

#### 5.3.1 Header Row
- **Layout:** flexDirection row, alignItems center, justifyContent space-between, marginBottom md
- **Left:** Text variant=heading4, weight=bold: "Recovery Templates"
- **Right:** Badge variant=outline, size=sm → BadgeText size=sm: "Copy only — no auto-send"

#### 5.3.2 Description
- Text variant=body3, color=muted, marginBottom=xl: "These are draft messages for human review. Copy, edit, and send manually — no automated sending."

#### 5.3.3 Lead Cards (one per flagged lead)
- **Card:** variant=outlined, padding=lg (24), marginBottom=lg (24)

**Card header:**
- Box flexDirection=row, alignItems=center, justifyContent=space-between, marginBottom=lg, flexWrap=wrap, gap=sm
- Left: Text variant=body2, weight=semibold: `{lead.customer_name} ({lead.lead_id})`
- Right: Box flexDirection=row, flexWrap=wrap, gap=sm
  - For each leak in lead.leaks: Badge variant=outline, size=sm → BadgeText size=sm: leak name

**For each leak type on this lead (separated by top border):**
- Box marginBottom=lg, paddingTop=lg, borderTopWidth=1, borderColor=$borderColor
- **Leak type header:** Box flexDirection=row, alignItems=center, justifyContent=space-between, marginBottom=sm
  - Left: Text variant=body3, weight=medium, color=muted, textTransform=capitalize: `{leakType.replace('_', ' ')}`
  - Right: Button size=sm, variant=ghost, onPress=copy → ButtonText variant=ghost, size=sm: "Copy"
- **Template content:** Text fontFamily=$mono, fontSize=13, lineHeight=1.6, color=default: multi-line message string

**Template message content (3 types):**

1. **no_reply:**
```
Hi {customer_name},

I noticed we haven't connected since your inquiry on {date}. I wanted to make sure you got the information you needed about our services.

Could we schedule a quick call this week? I'm available [days/times] or let me know what works for you.

Best regards,
[Your Name]
[Your Business]
```

2. **no_follow_up:**
```
Hi {customer_name},

Following up on our conversation from {date}. I wanted to check in and see if you had any questions or if there's anything else I can help with.

Let me know if you'd like to move forward or need more information.

Best regards,
[Your Name]
[Your Business]
```

3. **stale_quote:**
```
Hi {customer_name},

I wanted to touch base about the quote I sent on {date}. It's been a little while and I wanted to see if you had any questions or if there's anything I can clarify.

The quote is valid until [date]. Happy to discuss any adjustments.

Best regards,
[Your Name]
[Your Business]
```

---

### 5.4 Screen 4: SettingsScreen (Settings Tab)

**Layout:** Vertical scroll (ScrollView, flex=1, padding=lg/24px)

**Elements (top to bottom):**

#### 5.4.1 Title
- Text variant=heading4, weight=bold, marginBottom=xl: "Settings"

#### 5.4.2 Analysis Defaults Card
- Card variant=outlined, padding=lg, marginBottom=lg
- Title: Text variant=heading5, weight=semibold, marginBottom=md: "Analysis Defaults"
- **Default Average Ticket Input:**
  - Box marginBottom=md:
    - Text variant=body3, color=muted, marginBottom=sm, display=block: "Default Average Ticket (cents)"
    - TextInput (numeric): value=String(defaultTicket), style padding 12, borderWidth 1, borderColor #e5e7eb, borderRadius 8, bg #fff
- **Auto-analyze toggle:**
  - Box flexDirection=row, alignItems=center, justifyContent=space-between:
    - Text variant=body2: "Auto-analyze on paste"
    - Switch value=autoAnalyze, onValueChange=setAutoAnalyze

#### 5.4.3 Display Options Card
- Card variant=outlined, padding=lg, marginBottom=lg
- Title: Text variant=heading5, weight=semibold, marginBottom=md: "Display Options"
- **Show leak details toggle:**
  - Box flexDirection=row, alignItems=center, justifyContent=space-between, marginBottom=sm:
    - Text variant=body2: "Show leak details in table"
    - Switch value=showLeakDetails, onValueChange=setShowLeakDetails
- **Dark mode toggle:**
  - Box flexDirection=row, alignItems=center, justifyContent=space-between:
    - Text variant=body2: "Dark mode"
    - Switch value=(theme==='dark'), onValueChange → setTheme dark/light

#### 5.4.4 About Card
- Card variant=outlined, padding=lg, marginBottom=lg
- Title: Text variant=heading5, weight=semibold, marginBottom=md: "About"
- Box gap=sm:
  - Text variant=body2, weight=semibold: "Missed Lead Revenue Finder"
  - Text variant=body3, color=muted: "Version 1.0.0"
  - Text variant=body3, color=muted: "Find missed revenue from lead leaks"

#### 5.4.5 Data Privacy Card
- Card variant=outlined, padding=lg, marginBottom=lg
- **Special styling:** backgroundColor=$errorBackground (#fef2f2), borderColor=$errorBorder (#fca5a5), borderWidth=1
- Title: Text variant=heading5, weight=semibold, color=error, marginBottom=sm: "Data Privacy"
- Body: Text variant=body3, color=muted: "All analysis runs locally on your device. No data is sent to any server."

---

### 5.5 Empty States (Report & Templates when no analysis run)

**Report empty state:**
- Box flex=1, alignItems=center, justifyContent=center, padding=48
- Text variant=body2, color=muted, textAlign=center: "No report yet. Go to Analyze tab and run an analysis first."

**Templates empty state:**
- Box flex=1, alignItems=center, justifyContent=center, padding=48
- Text variant=body2, color=muted, textAlign=center: "No templates yet. Run an analysis to generate recovery templates."

---

## 6. Bottom Tab Bar

### 6.1 Container
- Box borderTopWidth=1, borderColor="#E5E7EB", backgroundColor="#FFFFFF", paddingBottom=48
- Inner: Box flexDirection=row, justifyContent=space-around, paddingVertical=12

### 6.2 Tab Buttons
- 4 buttons in a row, space-around
- Each Button:
  - variant: `primary` if active, `ghost` if inactive
  - size: `sm`
  - onPress: switch to tab (blocked for report/templates if no report)
  - disabled: report/templates blocked when no analysis
- Inner content of each tab button:
  - Box flexDirection=row, alignItems=center, gap=4:
    - Text variant=body3: emoji icon (📊, 📈, 📝, ⚙️)
    - Text variant=body3, weight=medium: tab label (Analyze, Report, Templates, Settings)

---

## 7. Data Model & Business Logic

### 7.1 CSV Format

**Required columns (case-insensitive, aliases accepted):**

| Canonical | Aliases |
|-----------|---------|
| lead_id | id, lead id, leadId |
| created_at | created, date, submitted_at, lead date, received_at |
| customer_name | name, customer, client, full name |
| contact | email, phone, mobile, contact info |
| source | channel, lead source, campaign |
| status | stage, pipeline stage, outcome |
| last_contact_at | last contact, replied_at, contacted_at, last_reply_at |
| next_follow_up_at | follow up, follow_up_at, next step date |
| estimated_value | value, deal value, quote amount, ticket, revenue |
| notes | note, comments, message, request |

**Status values:** new, contacted, qualified, booked, lost, recovered, won (unknown → new with warning)

**Date formats:** ISO (2024-01-15 or 2024-01-15T10:00:00Z) or US (01/15/2024)

**Money:** plain numbers (50000) or currency strings ($500.00, 1,250) — values in cents

### 7.2 Leak Detection Rules

| Leak | Condition |
|------|-----------|
| **No reply** | `last_contact_at` blank AND status not booked/lost/recovered/won |
| **Slow reply** | `last_contact_at - created_at > 24h` AND status not terminal |
| **No follow-up** | Status contacted/qualified AND `next_follow_up_at` blank |
| **Stale quote** | Status qualified AND `last_contact_at` older than 7 days |

A lead can have multiple leaks. Unique affected leads are counted once.

### 7.3 Revenue Formulas

- **Lead value** = estimated_value or default average ticket (default 25000 cents = $250)
- **Potential missed revenue** = sum of lead values for unique leads with ≥1 leak, excluding terminal statuses
- **Contacted revenue at risk** = sum for contacted/qualified leads with a follow-up leak
- **Confirmed recovered revenue** = sum for leads with status recovered/booked/won (explicit only)

### 7.4 Data Types

```typescript
interface Lead {
  lead_id: string;
  created_at: string | null;
  customer_name: string;
  contact: string;
  source: string;
  status: string;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  estimated_value: number;
  notes: string;
}

interface LeadWithLeaks extends Lead {
  leaks: string[]; // ['no_reply', 'slow_reply', 'no_follow_up', 'stale_quote']
}

interface LeakSummary {
  uniqueAffected: number;
  noReply: number;
  slowReply: number;
  noFollowUp: number;
  staleQuote: number;
}

interface RevenueSummary {
  potentialMissedRevenue: number;   // in cents
  contactedRevenueAtRisk: number;   // in cents
  confirmedRecoveredRevenue: number; // in cents
}
```

### 7.5 formatCurrency Function
- Input: number in cents (e.g., 75000 = $750.00)
- Output: formatted currency string (e.g., "$750.00")

### 7.6 Sample CSV Data (used by Load Sample button)

```csv
lead_id,created_at,customer_name,contact,source,status,last_contact_at,next_follow_up_at,estimated_value,notes
L1,2024-01-15,John Smith,john.smith@email.com,Website,booked,2024-01-16,2024-01-20,75000,Booked for consultation
L2,2024-01-10,Jane Doe,jane.doe@email.com,Referral,new,,,50000,No reply yet
L3,2024-01-05,Bob Wilson,bob.wilson@email.com,Ad,contacted,2024-01-06,,60000,Slow reply - 25 hours
L4,2024-01-08,Alice Brown,alice.brown@email.com,Phone,contacted,2024-01-09,,45000,No follow-up scheduled
L5,2024-01-01,Charlie Davis,charlie.davis@email.com,Website,qualified,2024-01-01,,80000,Stale quote - 9 days old
```

**Expected results with sample data:**
- 5 leads analyzed, 1 booked (no leaks), 4 with leaks
- L1: booked, no leaks
- L2: new, no reply → no_reply leak
- L3: contacted, slow reply (>24h) → slow_reply leak
- L4: contacted, no follow-up → no_follow_up leak
- L5: qualified, stale quote (>7 days) → stale_quote leak
- Revenue: potential missed = L2+L3+L4+L5 values; contacted at risk = L3+L4; confirmed recovered = L1

---

## 8. State Management

### 8.1 useLeadAnalysis Hook

**State:**
```typescript
csvText: string          // current CSV input
defaultTicket: number    // default 25000 (cents)
report: {
  summary: LeakSummary;
  revenue: RevenueSummary;
  leads: LeadWithLeaks[];
} | null
errors: string[]
warnings: string[]
isLoading: boolean
```

**Actions:**
- `setCsvText(text)` — updates CSV input
- `setDefaultTicket(val)` — updates default ticket
- `handleAnalyze()` — parses CSV, detects leaks, computes revenue, sets report

### 8.2 App-Level State (App.tsx)

```typescript
activeTab: 'input' | 'report' | 'templates' | 'settings'  // default: 'input'
// Plus all state from useLeadAnalysis hook (destructured)
```

**Navigation flow:**
1. User starts on Input tab
2. Pastes CSV or clicks "Load sample"
3. Clicks "Analyze" → `handleAnalyze()` runs + `setActiveTab('report')` auto-navigates to Report
4. User can then switch to Templates tab (now enabled)
5. Settings tab always available

---

## 9. Advanced Theme Variants

Beyond `light` and `dark`, the system defines 4 additional theme variants:

| Theme | Base | Key Overrides |
|-------|------|--------------|
| `light_subtle` | light | background: #fafafa (slightly off-white) |
| `dark_subtle` | dark | background: #111113 (slightly lighter than dark) |
| `light_inverted` | light | background: #18181b, color: #fafafa, borderColor: #3f3f46 |
| `dark_inverted` | dark | background: #fafafa, color: #18181b, borderColor: #d4d4d8 |

**Settings:** `allowedStyleValues: 'somewhat-strict-web'`, `themeClassNameOnRoot: true`, `maxDarkLightNesting: 3`

---

## 10. Additional UI Components (Exported but not currently used in screens)

These components exist in the `@missed-lead/ui` package and are available for use:

| Component | Purpose |
|-----------|---------|
| Input | Styled text input |
| Sheet | Bottom sheet / modal sheet |
| Toast | Toast notification |
| Progress | Progress bar |
| Slider | Range slider |
| Switch | Toggle switch (RN Switch used directly in Settings) |
| TextArea | Multi-line text input |
| Separator | Horizontal/vertical divider line |

**Hooks available:**
- `useTheme()` — current theme accessor
- `useColorScheme()` — light/dark detection
- `useMedia()` — media query hook

---

## 11. Visual Hierarchy & Design Patterns Summary

### 11.1 Color Usage Patterns

| Context | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Page background | #ffffff | #09090b |
| Card background | #ffffff | #09090b |
| Card border | #d4d4d8 (light gray) | #3f3f46 (dark gray) |
| Primary text | #18181b (near-black) | #fafafa (near-white) |
| Muted text | #71717a (gray) | #a1a1aa (lighter gray) |
| Primary actions | #0066cc (blue) | #3385d6 (lighter blue) |
| Error/missed | #ef4444 (red) | #f87171 (lighter red) |
| Warning/stale | #f59e0b (amber) | #fbbf24 (lighter amber) |
| Success/recovered | #10b981 (green) | #34d399 (lighter green) |
| Tab bar background | #ffffff (hardcoded) | #ffffff (hardcoded) |
| Tab bar border | #E5E7EB (hardcoded) | #E5E7EB (hardcoded) |

### 11.2 Spacing Patterns

| Context | Value |
|---------|-------|
| Screen edge padding | 24px (lg) |
| Card padding | 24px (lg) for sections, 16px (md) for compact cards |
| Card margin bottom | 24px (lg) |
| Gap between cards in row | 16px (md) |
| Section margin bottom | 32px (xl) |
| Small gaps | 12px (sm) |
| Tab bar vertical padding | 12px |
| Tab bar bottom padding | 48px (safe area) |
| Empty state padding | 48px |

### 11.3 Component Usage Rules

1. **Text must always be inside a `<Text>` or `<ButtonText>` or `<BadgeText>`** — React Native will crash on bare strings inside `View` components
2. **Button wraps ButtonText** — never put bare text in a Button
3. **Badge wraps BadgeText** — never put bare text in a Badge
4. **Card is a View** — it can contain Box, Text, Badge, etc. freely
5. **Tab bar buttons** contain a Box with Text elements (icon + label), not ButtonText

### 11.4 Visual Stone Hierarchy

1. **Heading 4** (24px, 600) — screen titles
2. **Heading 5** (20px, 600) — card section titles
3. **Heading 3** (30px, 600) — revenue amounts (big numbers)
4. **Heading 2** (36px, 700) — metric counts (biggest numbers)
5. **Body 2** (14px, 400) — primary body text, labels
6. **Body 3** (13px, 400) — secondary body text, helper text
7. **Caption** (12px, 400) — table cells, small labels, card descriptions

---

## 12. What's NOT in the App (Scope Boundaries)

- No authentication / login
- No server / API calls
- No push notifications
- No data persistence (state resets on app close)
- No file upload (CSV is pasted, not uploaded)
- No analytics / tracking
- No onboarding flow
- No splash screen content (just a splash icon during load)
- No dark mode toggle wired to actual theme switching (state exists but not connected)
- No actual clipboard copy functionality (Copy button currently logs to console)
- No automated message sending (templates are copy-only)

---

## 13. Reconstruction Notes for Google Stitch

1. **This is a mobile app** — design for iOS/Android phone screens, portrait orientation
2. **Bottom tab navigation** — 4 tabs, 2 disabled until analysis runs
3. **Clean, minimal, utility-first design** — this is a B2B tool, not a consumer app. Think clean cards, clear data hierarchy, no decorative elements.
4. **Color semantics are critical** — red = lost revenue, amber = risk, green = recovered, blue = primary/action
5. **Data is dense** — the Report screen has 3 revenue cards, 5 metric cards, and a multi-row table. Design for information density without clutter.
6. **All processing is local** — no loading spinners for network, only for the brief analysis computation
7. **No empty illustrations** — empty states are just centered muted text
8. **Monospace for data** — CSV input and template output use monospace font
9. **Privacy is a feature** — the Data Privacy card in Settings uses error-themed colors to draw attention
10. **The design system is comprehensive** — use the exact token values from Section 3 for consistent reconstruction
