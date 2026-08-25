# Graph Report - project-9  (2026-08-25)

## Corpus Check
- 94 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1227 nodes · 1642 edges · 144 communities (113 shown, 31 thin omitted)
- Extraction: 91% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 137 edges (avg confidence: 0.88)
- Token cost: 497,851 input · 0 output

## Community Hubs (Navigation)
- DB Schema & Ingest Repository
- Tamagui Component Props
- Mobile App Shell & Screens
- Leak Detection, Revenue & Normalization
- Web App Components
- Community 40
- Community 41
- Community 47
- Community 48
- Community 49
- Community 51
- Community 59
- API Endpoints & JWT Auth
- Community 60
- Community 61
- Community 67
- Community 68
- Community 69
- Community 75
- Core Package Exports
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 109
- Community 110
- Community 112
- Community 113
- Community 114
- Core ESM Build Config
- Expo Module Dependencies
- Tamagui Runtime Dependencies
- Test Tooling Dependencies
- Expo Router Starter (mlead boilerplate)
- Root TS Config
- Mobile Runtime Dependencies
- PWA Manifest
- Multi-Tenant Schema Migration
- mlead Package Manifest
- Tamagui Dev Dependencies
- Tamagui Peer Dependencies
- Community 34
- Community 35
- Community 39
- Core TS Build Config
- Community 45
- Community 46
- Expo Icon & Splash Assets
- Community 52
- Community 53
- Community 54
- Community 55
- Community 57
- Community 58
- Community 62
- Community 64
- Community 65
- Community 66
- UI Package TS Config
- Community 70
- Community 72
- Community 73
- Community 74
- Community 76
- Community 77
- Community 78
- Community 79
- UI Package Manifest
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- mlead App Config
- Community 90
- Community 91
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- v1 README: CSV Flow & Leak Rules
- Mobile Docs & EAS Build Plans
- Community 71
- Phase 1 Docs: RLS, Grants & Merge Rules
- Target v2 Architecture & Onboarding
- Dedupe Keys & Double-Count Pitfalls
- Detection Service & Cron Sweep
- Phase 1 Outcome & Lessons
- Build Order & Phase Dependencies
- Push Notification Delivery
- Email Ingestion & Webhook Pitfalls
- Community 36
- Community 37
- Community 38
- Community 42
- Community 43
- Community 44
- Community 50
- Community 56
- Community 63

## God Nodes (most connected - your core abstractions)
1. `Phase 1 — Multi-Tenant Foundation (v2.0 milestone)` - 19 edges
2. `compilerOptions` - 17 edges
3. `compilerOptions` - 17 edges
4. `compilerOptions` - 16 edges
5. `compilerOptions` - 16 edges
6. `compilerOptions` - 16 edges
7. `expo` - 15 edges
8. `expo` - 13 edges
9. `@missed-lead/db README` - 13 edges
10. `tenantPolicy()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Non-technical onboarding flows` --semantically_similar_to--> `CSV Lead Format`  [INFERRED] [semantically similar]
  .planning/PROJECT.md → README.md
- `Recovery Message Templates` --semantically_similar_to--> `Draft-and-approve follow-ups (one-tap send)`  [INFERRED] [semantically similar]
  README.md → .planning/notes/product-direction-auto-capture.md
- `Four Mobile Screens` --semantically_similar_to--> `Four App Tabs (Analyze/Report/Templates/Settings)`  [INFERRED] [semantically similar]
  mobile/README.md → STITCH_UI_SPEC.md
- `Offline & Local-Only Data` --semantically_similar_to--> `Browser-Local Processing`  [INFERRED] [semantically similar]
  mobile/README.md → README.md
- `Email/phone normalization rules` --semantically_similar_to--> `mergeLeadFields — pure merge function`  [INFERRED] [semantically similar]
  .planning/phases/phase-1-foundation.md → packages/db/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Normalize → identity lookup → idempotent event → merge onto one lead** — planning_phases_phase_1_foundation_normalization_rules, packages_db_readme_two_dedupe_mechanisms, packages_db_readme_lead_events, packages_db_readme_lead_identities, packages_db_readme_record_lead_event, packages_db_readme_upsert_lead, packages_db_readme_merge_lead_fields [EXTRACTED 1.00]
- **Web + Mobile Dual-Track Architecture** — plan_web_pwa_track, plan_mobile_expo_track, plan_shared_core_package, plan_universal_tamagui [EXTRACTED 1.00]
- **The Four Lead Leak Rules** — readme_leak_no_reply, readme_leak_slow_reply, readme_leak_no_follow_up, readme_leak_stale_quote [EXTRACTED 1.00]
- **Graduated autonomy ladder: notify, then draft-and-approve, then telemetry-gated full auto with guardrails** — planning_project_push_notifications, planning_notes_product_direction_auto_capture_draft_and_approve_follow_ups, planning_seeds_full_auto_booking_approval_rate_telemetry, planning_seeds_full_auto_booking_unlock_criteria, planning_seeds_full_auto_booking_autonomy_guardrails, planning_seeds_full_auto_booking_auto_booking_behavior [EXTRACTED 1.00]
- **All ingestion sources converge on one normalized Lead schema feeding the core engine** — planning_notes_product_direction_auto_capture_webhook_ingestion, planning_notes_product_direction_auto_capture_email_forwarding_ingestion, planning_project_csv_upload_as_backfill, planning_project_normalized_lead_schema, planning_project_packages_core [EXTRACTED 1.00]
- **Lead Capture Pipeline: sources to ingest to DB to detection to push** — planning_research_architecture_cloudflare_email_worker, planning_research_architecture_ingest_api, planning_research_architecture_lead_schema, planning_research_architecture_neon_postgres_rls, planning_research_architecture_detection_service, planning_research_architecture_missed_lead_records, planning_research_architecture_notification_dispatcher, planning_research_architecture_deep_link_to_lead_detail [EXTRACTED 1.00]
- **Unauthenticated webhook ingest kept tenant-isolated in the database** — planning_phases_phase_1_foundation_webhook_hole, planning_phases_phase_1_foundation_ingest_role, packages_db_readme_ingest_role, packages_db_readme_with_ingest_scope, planning_phases_phase_1_foundation_service_role_fallback [EXTRACTED 1.00]
- **Identity Collapse Defense: idempotency and dedupe keys designed into the schema** — planning_research_pitfalls_duplicate_posts, planning_research_pitfalls_double_counted_lost_revenue, planning_research_pitfalls_idempotency_key_hash, planning_research_pitfalls_dedupe_key_normalized_contact_fuzzy_name, planning_research_architecture_dedupe_hash_name_contact [INFERRED 0.85]
- **Tenant Isolation Enforced at the Database, Not in App Code** — planning_research_stack_supabase_auth_or_clerk, planning_research_stack_postgres_rls_tenant_isolation, planning_research_architecture_multi_tenant_customer_id, planning_research_pitfalls_rls_forgotten_tenant_data_leak, planning_research_pitfalls_rls_at_migration_time_with_cross_tenant_test [INFERRED 0.85]
- **Tenant isolation is enforced in the database and proven by a falsifiable test** — planning_project_supabase_for_auth_and_db, planning_project_multi_tenant_postgres_on_supabase, planning_project_ingest_role_without_bypassrls, planning_project_rls_grants_nothing, planning_state_isolation_negative_control [INFERRED 0.85]
- **RLS enforcement stack: grants, policies, tenant lookup, and its negative control** — packages_db_readme_rls_grants_nothing, packages_db_readme_0002_grants_sql, packages_db_readme_leads_tenant_isolation_policy, planning_phases_phase_1_foundation_current_customer_id, planning_phases_phase_1_foundation_tenant_isolation_policy, packages_db_readme_prove_isolation, planning_phases_phase_1_foundation_negative_control [INFERRED 0.95]

## Communities (144 total, 31 thin omitted)

### Community 0 - "DB Schema & Ingest Repository"
Cohesion: 0.05
Nodes (52): Db, Identity, IngestLeadInput, MergeableLead, RecordEventResult, ResolvedDetectionSettings, Tx, UpsertLeadResult (+44 more)

### Community 11 - "Tamagui Component Props"
Cohesion: 0.13
Nodes (16): BoxProps, CardProps, InputProps, InputTextProps, ProgressProps, SliderProps, SwitchProps, ToastProps (+8 more)

### Community 14 - "Mobile App Shell & Screens"
Cohesion: 0.13
Nodes (13): InputScreenProps, ReportScreenProps, TemplatesScreenProps, App(), useLeadAnalysis(), InputScreen(), ReportScreen(), SettingsScreen() (+5 more)

### Community 3 - "Leak Detection, Revenue & Normalization"
Cohesion: 0.07
Nodes (30): DetectionConfig, LeadWithLeaks, LeakSummary, LeakType, ClassifiedContact, ContactKind, Lead, LeadStatus (+22 more)

### Community 33 - "Web App Components"
Cohesion: 0.25
Nodes (6): ReportProps, TemplatesProps, App(), Report(), Templates, statusColors

### Community 40 - "Community 40"
Cohesion: 0.22
Nodes (8): BadgeProps, BadgeSize, BadgeTextProps, BadgeVariant, Badge, badgeConfig, BadgeText, badgeTextConfig

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (8): ButtonProps, ButtonSize, ButtonTextProps, ButtonVariant, Button, buttonConfig, ButtonText, buttonTextConfig

### Community 47 - "Community 47"
Cohesion: 0.25
Nodes (7): TextAlign, TextColor, TextProps, TextVariant, TextWeight, Text, textConfig

### Community 48 - "Community 48"
Cohesion: 0.25
Nodes (7): AppConfig, Conf, config, dark, light, themes, tokens

### Community 49 - "Community 49"
Cohesion: 0.29
Nodes (5): AppConfig, Conf, AppConfig, TamaguiCustomConfig, @tamagui/core

### Community 51 - "Community 51"
Cohesion: 0.29
Nodes (5): AppConfig, TamaguiCustomConfig, @tamagui/core, config, font

### Community 59 - "Community 59"
Cohesion: 0.40
Nodes (5): Tenant, createTenant(), admin, RUN, sql

### Community 6 - "API Endpoints & JWT Auth"
Cohesion: 0.16
Nodes (19): AuthFailure, AuthResult, ResolvedCustomer, GET(), handler(), bearer(), keySet(), resolveCustomer() (+11 more)

### Community 60 - "Community 60"
Cohesion: 0.33
Nodes (5): SeparatorOrientation, SeparatorProps, SeparatorVariant, Separator, separatorConfig

### Community 61 - "Community 61"
Cohesion: 0.33
Nodes (5): SheetProps, SheetSize, SheetVariant, Sheet, sheetConfig

### Community 67 - "Community 67"
Cohesion: 0.40
Nodes (4): ScrollDirection, ScrollViewProps, ScrollView, scrollViewConfig

### Community 68 - "Community 68"
Cohesion: 0.40
Nodes (4): TextAreaProps, TextAreaTextProps, TextArea, TextAreaText

### Community 69 - "Community 69"
Cohesion: 0.40
Nodes (4): TamaguiTheme, useColorScheme(), useMedia(), useTheme()

### Community 10 - "Core Package Exports"
Cohesion: 0.09
Nodes (23): exports, ./leaks, ./parser, ./revenue, import, import, require, types (+15 more)

### Community 12 - "Core ESM Build Config"
Cohesion: 0.09
Nodes (21): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module (+13 more)

### Community 13 - "Expo Module Dependencies"
Cohesion: 0.10
Nodes (21): dependencies, expo, expo-glass-effect, expo-image, expo-symbols, expo-system-ui, @expo/ui, expo-web-browser (+13 more)

### Community 17 - "Tamagui Runtime Dependencies"
Cohesion: 0.11
Nodes (19): dependencies, react, @tamagui/compose-refs, @tamagui/constants, @tamagui/react-native-media-driver, @tamagui/react-native-use-responder-events, @tamagui/use-direction, @tamagui/use-event (+11 more)

### Community 19 - "Test Tooling Dependencies"
Cohesion: 0.12
Nodes (18): devDependencies, canvas, jsdom, @testing-library/dom, @testing-library/jest-dom, vite-plugin-pwa, @vitejs/plugin-react, vitest (+10 more)

### Community 2 - "Expo Router Starter (mlead boilerplate)"
Cohesion: 0.08
Nodes (34): plugins, expo-router, styles, TabTwoScreen(), getDevMenuHint(), HomeScreen(), styles, AnimatedIcon() (+26 more)

### Community 20 - "Root TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, module (+10 more)

### Community 22 - "Mobile Runtime Dependencies"
Cohesion: 0.12
Nodes (16): react-native-reanimated, dependencies, expo, @missed-lead/core, @missed-lead/ui, react, react-native-reanimated, vitest (+8 more)

### Community 24 - "PWA Manifest"
Cohesion: 0.12
Nodes (15): background_color, categories, description, display, icons, name, orientation, screenshots (+7 more)

### Community 26 - "Multi-Tenant Schema Migration"
Cohesion: 0.29
Nodes (11): "auth"."users", "customers", "detection_settings", "lead_events", "lead_identities", "lead_sources", "leads", "push_tokens" (+3 more)

### Community 27 - "mlead Package Manifest"
Cohesion: 0.17
Nodes (11): main, name, private, scripts, android, ios, lint, reset-project (+3 more)

### Community 28 - "Tamagui Dev Dependencies"
Cohesion: 0.17
Nodes (12): @tamagui/animations-react-native, @tamagui/font-inter, @tamagui/shorthands, devDependencies, @tamagui/animations-react-native, @tamagui/font-inter, @tamagui/shorthands, vitest (+4 more)

### Community 30 - "Tamagui Peer Dependencies"
Cohesion: 0.18
Nodes (11): tamagui, @tamagui/config, tamagui, @tamagui/config, peerDependencies, react, tamagui, @tamagui/config (+3 more)

### Community 34 - "Community 34"
Cohesion: 0.20
Nodes (9): main, name, private, scripts, android, ios, start, web (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.20
Nodes (9): workspaces, exclude, extends, include, packages/*, mobile, tamagui.config.ts, dist (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 4 - "Core TS Build Config"
Cohesion: 0.04
Nodes (43): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module (+35 more)

### Community 45 - "Community 45"
Cohesion: 0.22
Nodes (8): buildCommand, crons, devCommand, framework, headers, installCommand, outputDirectory, rewrites

### Community 46 - "Community 46"
Cohesion: 0.25
Nodes (7): author, description, keywords, license, main, name, version

### Community 5 - "Expo Icon & Splash Assets"
Cohesion: 0.05
Nodes (38): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, versionCode (+30 more)

### Community 52 - "Community 52"
Cohesion: 0.29
Nodes (4): glowKeyframe, keyframe, logoKeyframe, styles

### Community 53 - "Community 53"
Cohesion: 0.29
Nodes (6): extends, include, expo-env.d.ts, .expo/types/**/*.ts, **/*.ts, **/*.tsx

### Community 54 - "Community 54"
Cohesion: 0.29
Nodes (7): compilerOptions, paths, strict, @/*, @/assets/*, ./src/*, ./assets/*

### Community 55 - "Community 55"
Cohesion: 0.29
Nodes (7): typescript, devDependencies, typescript, vitest, typescript, typescript, vitest

### Community 57 - "Community 57"
Cohesion: 0.33
Nodes (6): devDependencies, @types/react, typescript, @types/react, @types/react, @types/react

### Community 58 - "Community 58"
Cohesion: 0.33
Nodes (6): devDependencies, @babel/core, @types/react, typescript, @babel/core, @babel/core

### Community 62 - "Community 62"
Cohesion: 0.33
Nodes (5): config, dark, light, themes, tokens

### Community 64 - "Community 64"
Cohesion: 0.40
Nodes (4): config, { getDefaultConfig }, path, workspaceRoot

### Community 65 - "Community 65"
Cohesion: 0.40
Nodes (4): compilerOptions, strict, extends, expo/tsconfig.base

### Community 66 - "Community 66"
Cohesion: 0.40
Nodes (5): scripts, build, dev, preview, test

### Community 7 - "UI Package TS Config"
Cohesion: 0.07
Nodes (26): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+18 more)

### Community 70 - "Community 70"
Cohesion: 0.50
Nodes (4): react-native, react-native, react-native, react-native

### Community 72 - "Community 72"
Cohesion: 0.50
Nodes (4): @tamagui/core, @tamagui/core, @tamagui/core, @tamagui/core

### Community 73 - "Community 73"
Cohesion: 1.00
Nodes (3): psql_do(), restore(), prove-isolation.sh script

### Community 76 - "Community 76"
Cohesion: 0.67
Nodes (3): expo-status-bar, expo-status-bar, expo-status-bar

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (3): react-dom, react-dom, react-dom

### Community 78 - "Community 78"
Cohesion: 0.67
Nodes (3): react-native-gesture-handler, react-native-gesture-handler, react-native-gesture-handler

### Community 79 - "Community 79"
Cohesion: 0.67
Nodes (3): react-native-web, react-native-web, react-native-web

### Community 8 - "UI Package Manifest"
Cohesion: 0.08
Nodes (24): import, require, types, description, exports, ./components, ./hooks, import (+16 more)

### Community 80 - "Community 80"
Cohesion: 0.67
Nodes (3): @tamagui/animations-moti, @tamagui/animations-moti, @tamagui/animations-moti

### Community 81 - "Community 81"
Cohesion: 0.67
Nodes (3): @tamagui/themes, @tamagui/themes, @tamagui/themes

### Community 82 - "Community 82"
Cohesion: 0.67
Nodes (3): @types/react-native, @types/react-native, @types/react-native

### Community 9 - "mlead App Config"
Cohesion: 0.08
Nodes (23): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, predictiveBackGestureEnabled, reactCompiler, typedRoutes (+15 more)

### Community 18 - "v1 README: CSV Flow & Leak Rules"
Cohesion: 0.16
Nodes (19): CSV Lead Format, Lead Leak Detection, Leak: No Follow-up, Leak: No Reply, Leak: Slow Reply, Leak: Stale Quote, Recovery Message Templates, Missed Lead Revenue Finder (+11 more)

### Community 21 - "Mobile Docs & EAS Build Plans"
Cohesion: 0.15
Nodes (17): EAS Build Profiles, Four Mobile Screens, EAS Build & Store Submission, Mobile Expo Track, Shared Core Package, Web PWA Track, Bottom Tab Navigation, Color Token Palette (+9 more)

### Community 71 - "Community 71"
Cohesion: 0.50
Nodes (4): Revenue Estimation, Offline & Local-Only Data, Browser-Local Processing, v1 limitations

### Community 1 - "Phase 1 Docs: RLS, Grants & Merge Rules"
Cohesion: 0.06
Nodes (62): 0002_grants.sql, mergeLeadFields — pure merge function, merge.test.ts (pure, needs no database), test:prove-isolation / prove-isolation.sh, recordLeadEvent(), upsertLead(), withIngestScope(db, customerId, fn), drizzle-kit generate --custom (+54 more)

### Community 15 - "Target v2 Architecture & Onboarding"
Cohesion: 0.11
Nodes (21): Existing Stateless Monorepo (packages/core + packages/ui, Vite PWA, Expo 57), Onboarding UI (connection cards with live listening test), Target Architecture (v2), Actionable Missed-Revenue Notification, Anti-Features (now), Anti-Feature: Auto-Reply / Booking (graduated autonomy later), Competitor Capture Loop Pattern (Podium/Birdeye class), CSV Upload as Optional 'Backfill Your History' Step (+13 more)

### Community 16 - "Dedupe Keys & Double-Count Pitfalls"
Cohesion: 0.16
Nodes (20): Dedupe by Hash of Name + Contact, Pitfall 7: Connection Pool Exhaustion, Prevention: Dedupe Key on Normalized Phone/Email + Fuzzy Name, Pitfall 11: Double-Counted Lost Revenue, Pitfall 2: Duplicate POSTs, Prevention: Idempotency Key = Hash of Payload Identity Fields, Prevention: Neon HTTP Serverless Driver from Day One, Pitfall 8: RLS Forgotten and Tenant Data Leaks Across Accounts (+12 more)

### Community 23 - "Detection Service & Cron Sweep"
Cohesion: 0.17
Nodes (16): Detection Service (pure function in packages/core), Missed-Lead Records with Dollar Estimate, Nightly Cron Sweep, Table Stake: Continuous Detection + Nightly Re-Sweep, Differentiators, Existing Leak-Detection + Revenue-Estimation Engine, Table Stake: Inbound Email Address per Customer, Table Stake: Lead Normalization into Existing Schema (+8 more)

### Community 25 - "Phase 1 Outcome & Lessons"
Cohesion: 0.21
Nodes (13): packages/db, /api/health and /api/me with local JWKS (ES256) verification, Multi-tenant Postgres with RLS (packages/db), Isolation negative control (test:prove-isolation), Local Supabase stack (supabase:start, db:migrate), Phase 1 — Multi-tenant foundation (complete), Six-phase v2.0 milestone structure, Test command matrix (Docker requirements per suite) (+5 more)

### Community 29 - "Build Order & Phase Dependencies"
Cohesion: 0.27
Nodes (12): Build Step 6: Dashboard Upgrade + Settings Screens, Build Step 1: DB + Auth + Multi-Tenant Skeleton, Build Step 4: Detection-on-Event + Nightly Sweep, Build Step 3: Email Inbound Worker into Same Pipeline, Build Step 2: Ingest Webhook Endpoint + Test-Connection UX, Build Step 5: Push Notifications (mobile then PWA) + Content, Pitfall 9: Permission Asked Cold at First Launch Causes Permanent Denial, Push Notification Pitfalls (+4 more)

### Community 31 - "Push Notification Delivery"
Cohesion: 0.24
Nodes (11): Deep Link to Lead Detail Screen, Expo Push (mobile delivery), Notification Dispatcher (Expo push + web-push), Web Push (PWA delivery), Table Stake: Push Notification with Dollar Amount + Deep Link, Expo Push Notifications (expo-notifications) (mobile push recommendation), FCM/APNs Direct Wiring (rejected), OneSignal and similar push services (rejected for now) (+3 more)

### Community 32 - "Email Ingestion & Webhook Pitfalls"
Cohesion: 0.25
Nodes (11): Email Ingestion Pitfalls, Prevention: High-Entropy Secret in Hook URL Path, Pitfall 6: HTML/Quoted-Printable Mangling Produces Garbage Contact Fields, Prevention: Lightweight Spam Scoring + Visible Quarantine, Pitfall 4: Mail Loop, Prevention: Schema-Validated LLM Extraction, Flag Instead of Guess, Pitfall 5: Spam Floods Inbox and Junk Leads Pollute Revenue Estimates, Prevention: X-MissedLead Header and Own-Domain Sender Skip (+3 more)

### Community 36 - "Community 36"
Cohesion: 0.24
Nodes (10): packages/core, Accepted architecture consequences, CSV upload retained as backfill, Leak detection rules engine, Normalized Lead schema (single convergence point), Continuous detection with push notifications, Revenue estimation engine, Decision: backend jump accepted for v2 (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.22
Nodes (10): packages/ui (Tamagui design system), Deliberately broad target customer, Problem: manual CSV export friction, Personal WhatsApp is blocked (no official API), Source access reality matrix, Core Value Priority, Phase/milestone document evolution process, Decision Record — Automated Lead Capture & Recovery (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.36
Nodes (10): CRM OAuth connectors (HubSpot/Zoho/GHL), Email-forwarding ingestion (@in.missedlead.app inbox), Gmail read-only OAuth, Integration order (four phases), Meta stack (Instagram/Facebook DMs), Webhook ingestion (unique URL per customer), Milestone v2.0 — Automated Lead Capture & Recovery, Non-technical onboarding flows (+2 more)

### Community 42 - "Community 42"
Cohesion: 0.39
Nodes (9): Draft-and-approve follow-ups (one-tap send), Explicitly deferred scope, Approval-rate telemetry as autonomy gate, Full-auto booking behavior, Always-on autonomy guardrails, Full-auto unlock criteria, Seed: Full-Auto Booking Engine, Autonomy posture rationale (graduated) (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (9): Cloudflare Email Worker (Gmail filter forward receiver), Ingest API (/api/hook/[token].ts, /api/inbound-email.ts), Building SMTP Ourselves (rejected), Cloudflare Email Routing to Email Worker to Ingestion API (inbound email recommendation), Express Server on a VM (rejected), Hono / Nitro Meta-Frameworks (rejected), IMAP Polling (rejected), Postmark Inbound (~$15/mo alternative) (+1 more)

### Community 44 - "Community 44"
Cohesion: 0.25
Nodes (9): DB Layer (Drizzle schema: customers, lead_sources, leads, lead_events, detection_settings, push_tokens), Compliance-Lite Pitfalls, Prevention: Retention Policy Field, Delete-Account Cascade, Privacy Policy, Prevention: RLS on All Tables at Migration Time + Cross-Tenant Test, Pitfall 13: End-Customer PII Stored Without Bounds, Drizzle ORM (ORM/query recommendation), Prisma ORM (rejected), Raw SQL Everywhere (rejected) (+1 more)

### Community 50 - "Community 50"
Cohesion: 0.36
Nodes (8): CSV Upload Path as Historical Backfill, Normalized Lead Schema, Pitfall 12: CSV-Era Data vs Streamed Data Drift, Data Correctness Pitfalls, Prevention: One Leads Table with a Shared Normalizer, packages/core ingest/normalize Adapters, Detection Input Shifts from File-at-Rest to Event Stream, One Funnel, Many Pipes

### Community 56 - "Community 56"
Cohesion: 0.33
Nodes (7): Auth (email OAuth sign-in + session to customer_id middleware), Multi-Tenancy via customer_id, Neon Postgres with RLS by customer_id, Table Stake: Multi-Tenant Account with Email OAuth Login, Hand-Rolled JWT Sessions (rejected), Postgres RLS Tenant Isolation (rows scoped by customer_id), Supabase Auth or Clerk (auth/multi-tenant recommendation)

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (6): Ingest repository functions (upsertLead, recordLeadEvent, buildDedupeKey, withIngestScope), Identity merge (lead_identities), Webhook idempotency (lead_events.dedupe_key), Decision: contact splits into email/phone in the DB, Decision: merge policy is a pure function (mergeLeadFields), Decision: two dedupe mechanisms, not one

## Ambiguous Edges - Review These
- `Expo SDK 51 Mobile App` → `Expo SDK 57 Versioned Docs`  [AMBIGUOUS]
  mobile/AGENTS.md · relation: conceptually_related_to
- `Differentiator: Weekly Digest Email ('you recovered/left $X')` → `Notification Dispatcher (Expo push + web-push)`  [AMBIGUOUS]
  .planning/research/FEATURES.md · relation: conceptually_related_to
- `Email-forwarding ingestion (@in.missedlead.app inbox)` → `Phase 2 — Webhook ingest (next)`  [AMBIGUOUS]
  .planning/notes/product-direction-auto-capture.md · relation: conceptually_related_to
- `Integration order (four phases)` → `Explicitly deferred scope`  [AMBIGUOUS]
  .planning/PROJECT.md · relation: references
- `Cloudflare Email Worker (Gmail filter forward receiver)` → `Postmark Inbound (~$15/mo alternative)`  [AMBIGUOUS]
  .planning/research/STACK.md · relation: conceptually_related_to

## Knowledge Gaps
- **463 isolated node(s):** `Identity`, `IngestLeadInput`, `RecordEventResult`, `ResolvedDetectionSettings`, `Tx` (+458 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Expo SDK 51 Mobile App` and `Expo SDK 57 Versioned Docs`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Differentiator: Weekly Digest Email ('you recovered/left $X')` and `Notification Dispatcher (Expo push + web-push)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Email-forwarding ingestion (@in.missedlead.app inbox)` and `Phase 2 — Webhook ingest (next)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Integration order (four phases)` and `Explicitly deferred scope`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Cloudflare Email Worker (Gmail filter forward receiver)` and `Postmark Inbound (~$15/mo alternative)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `dependencies` connect `Tamagui Runtime Dependencies` to `Community 96`, `Community 97`, `Community 98`, `Community 99`, `Community 72`, `Community 77`, `Community 46`, `Community 80`, `Community 81`, `Mobile Runtime Dependencies`, `Community 94`, `Tamagui Dev Dependencies`, `Community 93`, `Tamagui Peer Dependencies`, `Community 95`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Expo Module Dependencies` to `Expo Router Starter (mlead boilerplate)`, `Expo Icon & Splash Assets`, `Community 70`, `Community 91`, `Community 76`, `Community 77`, `Community 78`, `Community 79`, `Mobile Runtime Dependencies`, `Community 87`, `Community 88`, `Community 89`, `Community 90`, `mlead Package Manifest`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._