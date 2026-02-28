# aiponge Frontend — Remediation Tasks

**Status:** The previous agent completed 0 of 11 assigned tasks. Every task below must be implemented. All paths are relative to `apps/aiponge/`.

Run `npx tsc --noEmit` after completing each task to catch regressions before moving on.

---

## TASK 1 — Migrate AlbumsScreen to shared state components

**File:** `src/screens/user/AlbumsScreen.tsx`

Add imports at the top:
```tsx
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';
import { EmptyState } from '../../components/shared/EmptyState';
```

**Replace lines 63–71** (custom loading with ActivityIndicator) with:
```tsx
if (isLoading) {
  return <LoadingState message={t('albums.loading')} />;
}
```

**Replace lines 74–83** (custom error with Ionicons alert-circle) with:
```tsx
if (isError) {
  return <ErrorState message={t('albums.failedToLoad')} />;
}
```

**Replace lines 86–105** (custom empty state with button) with:
```tsx
if (albums.length === 0 && !hasDraftAlbum) {
  return (
    <EmptyState
      icon="library-outline"
      title={t('albums.noAlbumsYet')}
      description={t('albums.createAlbumHint')}
      action={{ label: t('albums.goToJournal'), onPress: () => router.push('/books'), testID: 'button-go-to-books' }}
      testID="empty-albums"
    />
  );
}
```

**Remove unused styles** from `createStyles` (lines 210–244): `loadingContainer`, `loadingText`, `emptyContainer`, `emptyTitle`, `emptyText`, `createButton`, `createButtonText`.

**Remove** `ActivityIndicator` from the react-native import on line 2 if no longer used elsewhere in the file.

---

## TASK 2 — Migrate AlbumDetailScreen to shared state components

**File:** `src/screens/user/AlbumDetailScreen.tsx`

Add imports:
```tsx
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';
```

**Replace lines 317–326** (custom loading) with:
```tsx
if (isLoading) {
  return <LoadingState message={t('albums.loading')} />;
}
```

**Replace lines 328–338** (custom error) with:
```tsx
if (isError || !album) {
  return <ErrorState message={t('albums.failedToLoad')} />;
}
```

**Remove unused styles** from `createStyles` (lines 392–393, 394–399, 406–418): `loadingContainer`, `loadingText`, `errorContainer`, `errorTitle`, `errorText`. **Keep** `backButtonError` (lines 400–405).

Remove `ActivityIndicator` from the react-native import on line 1 if no longer used.

---

## TASK 3 — Migrate PrivateMusicScreen loading state

**File:** `src/screens/user/PrivateMusicScreen.tsx`

Add import:
```tsx
import { LoadingState } from '../../components/shared/LoadingState';
```

In the `ListEmptyComponent` useMemo (line 468), **replace lines 469–476** (inline ActivityIndicator block) with:
```tsx
if (isLoading) {
  return <LoadingState message={t('myMusic.loadingMusic')} fullScreen={false} />;
}
```

**Remove unused styles** from `createStyles` (lines 605–614): `loadingContainer`, `loadingText`.

Remove `ActivityIndicator` from the react-native import on line 2 if no longer used elsewhere in the file.

---

## TASK 4 — Move controllers from root layout to user layout

**File:** `app/_layout.tsx`

**Delete these 6 import lines** (29–34):
```tsx
import { ShareIntentHandler } from '../src/components/system/ShareIntentHandler';
import { TrackAlarmHandler } from '../src/components/music/TrackAlarmHandler';
import { PushNotificationInitializer } from '../src/components/system/PushNotificationInitializer';
import { QueueAutoAdvanceController } from '../src/components/music/QueueAutoAdvanceController';
import { AuthPlaybackController } from '../src/components/auth/AuthPlaybackController';
import { AlbumGenerationIndicator } from '../src/components/playlists/AlbumGenerationIndicator';
```

**Delete these 6 JSX lines** (159–164):
```tsx
<QueueAutoAdvanceController />
<AuthPlaybackController />
<TrackAlarmHandler />
<PushNotificationInitializer />
<ShareIntentHandler />
<AlbumGenerationIndicator />
```

**File:** `app/(user)/_layout.tsx`

**Add these imports** at the top of the file:
```tsx
import { QueueAutoAdvanceController } from '../../src/components/music/QueueAutoAdvanceController';
import { AuthPlaybackController } from '../../src/components/auth/AuthPlaybackController';
import { TrackAlarmHandler } from '../../src/components/music/TrackAlarmHandler';
import { PushNotificationInitializer } from '../../src/components/system/PushNotificationInitializer';
import { ShareIntentHandler } from '../../src/components/system/ShareIntentHandler';
import { AlbumGenerationIndicator } from '../../src/components/playlists/AlbumGenerationIndicator';
```

In the component's return JSX, **add the 6 controllers as siblings before** `<Tabs>`. Wrap with a Fragment:
```tsx
return (
  <>
    <QueueAutoAdvanceController />
    <AuthPlaybackController />
    <TrackAlarmHandler />
    <PushNotificationInitializer />
    <ShareIntentHandler />
    <AlbumGenerationIndicator />
    <Tabs /* existing tabs config */>
      {/* ... existing tab screens ... */}
    </Tabs>
  </>
);
```

---

## TASK 5 — Extract CreatePlaylistModal from PlaylistsScreen

**Create file:** `src/components/playlists/CreatePlaylistModal.tsx`

Extract from `src/screens/user/PlaylistsScreen.tsx` lines 97–166 (the modal JSX), lines 29–32 (form state: `playlistName`, `playlistDescription`, `isCreating`), and lines 69–82 (`handleCreatePlaylist`).

The new component accepts:
```typescript
interface CreatePlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (params: { name: string; description?: string }) => Promise<void>;
}
```

It manages its own form state internally. Reset form fields on successful creation. Move modal-related styles from PlaylistsScreen into the new file: `modalOverlay`, `modalContent`, `modalHeader`, `modalTitle`, `formGroup`, `formLabel`, `formInput`, `formTextArea`, `modalActions`, `cancelButton`, `cancelButtonText`, `createButton`, `createButtonDisabled`, `createButtonText`.

**Update PlaylistsScreen:** Remove `playlistName`, `playlistDescription`, `isCreating` state vars and `handleCreatePlaylist`. Keep only `showCreateModal`. Replace `{createPlaylistModal}` with:
```tsx
<CreatePlaylistModal
  visible={showCreateModal}
  onClose={() => setShowCreateModal(false)}
  onCreate={async ({ name, description }) => {
    await createPlaylist({ name, description });
  }}
/>
```

Remove the moved styles from PlaylistsScreen's `createStyles`.

---

## TASK 6 — Add fontWeights to typography

**File:** `src/theme/typography.ts` — Add after line 76 (after `letterSpacing`):
```typescript
export const fontWeights = {
  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,
};
```

Add `fontWeights` to the default export object at the bottom.

**File:** `src/theme/index.ts` — Add `fontWeights` to the typography re-export on lines 13–19.

---

## TASK 7 — Add ANIMATION.skeleton and replace hardcoded durations

**File:** `src/theme/constants.ts` — Add `skeleton: 800` to ANIMATION:
```typescript
export const ANIMATION = {
  fast: 150,
  normal: 250,
  slow: 350,
  skeleton: 800,
  spring: { tension: 40, friction: 7 },
} as const;
```

**File:** `src/components/shared/CollapsibleSection.tsx` — Line 50 has `duration: 200`. Import and replace:
```typescript
import { ANIMATION } from '../../theme/constants';
// line 50:
duration: ANIMATION.fast,
```

**File:** `src/components/shared/SkeletonLoaders.tsx` — Lines 25–26 have `duration: 800`. Import and replace both:
```typescript
import { ANIMATION, BORDER_RADIUS } from '../../theme/constants';
// lines 25-26:
withTiming(0.7, { duration: ANIMATION.skeleton }),
withTiming(0.3, { duration: ANIMATION.skeleton })
```

---

## TASK 8 — Replace hardcoded hex colors

**File:** `src/components/book/SelectableText.tsx`
This file uses a plain `StyleSheet.create()` at line ~209. Convert the affected styles to the `createStyles(colors: ColorScheme)` pattern (matching the rest of the codebase) or pass colors however the file already handles dynamic values. Then replace:
- Line 220: `backgroundColor: '#FFD700'` → `backgroundColor: colors.social.gold`
- Line 221: `color: '#6B21A8'` → `color: colors.brand.purple[800]`
- Line 226: `textDecorationColor: '#FFD70080'` → `textDecorationColor: 'rgba(251, 191, 36, 0.5)'`
- Line 230: `color: '#FFD700'` → `color: colors.social.gold`

**File:** `src/components/music/MusicGeneration/BatchAlbumCreationModal.tsx`
- Line 815: `color: '#ef4444'` → `color: colors.semantic.error`
- Line 838: `color: '#ef4444'` → `color: colors.semantic.error`

**File:** `src/components/music/MusicGeneration/ChapterPickerModal.tsx`
- Line 877: `color: '#ef4444'` → `color: colors.semantic.error`
- Line 899: `color: '#ef4444'` → `color: colors.semantic.error`

**File:** `src/components/shared/CollapsibleLanguageSelector.tsx`
- Line 201: `color: '#FFFFFF'` → `color: colors.absolute.white`

**File:** `src/components/shared/ErrorState.tsx`
- Line 74: `color: '#FFFFFF'` → `color: colors.absolute.white`

---

## TASK 9 — Create generation store factory and deduplicate

**Create:** `src/stores/createGenerationStore.ts`

Both `albumGenerationStore.ts` (311 lines) and `trackGenerationStore.ts` (466 lines) share identical logic for: `startGeneration`, `setPendingGeneration`, `stopPolling`, `pollProgress`, `checkActiveGenerations`, `clearGeneration`, `getActiveGenerationsList`. Differences:

| Aspect | Album | Track |
|--------|-------|-------|
| `pollInterval` | 3000 | 2000 |
| API endpoint | `/api/app/music/album-requests` | `/api/app/music/song-requests` |
| Active endpoint | `.../active/all` | `.../active` |
| Cache event | `ALBUM_GENERATION_COMPLETED` | `TRACK_GENERATION_COMPLETED` |
| `mergeProgress` | Preserves `visibility`, `targetLanguages`, `albumId`, `albumTitle` | Preserves `entryContent`, `imageUrl`, `streamingUrl` |
| `onCompleted` | Simple cache invalidation | Complex: emit events, streaming preview, finalizing phase |

Create a typed factory with config for `name`, `pollInterval`, `apiEndpoint`, `activeEndpoint`, `cacheEventType`, `isActive`, `createInitialProgress`, `mergeProgress`, `onCompleted`. The factory returns a Zustand `create()` call with all shared polling/state logic. Include TTL-based `completedRequestIds` cleanup (5-minute TTL, periodic sweep during polling) in the factory so both stores benefit.

Refactor both stores to use the factory. Keep `AlbumGenerationProgress`, `StartGenerationOptions` in albumGenerationStore. Keep `TrackGenerationEventEmitter`, `StreamingPreviewState`, and the complex completion handler in trackGenerationStore. Export the same public APIs and selectors from both stores — no consumer changes needed.

---

## TASK 10 — Merge PlaybackState + PlaybackQueue into PlaybackContext

**Create:** `src/contexts/PlaybackContext.tsx`

Combine `PlaybackStateContext.tsx` (103 lines) and `PlaybackQueueContext.tsx` (393 lines). Note: `PlaybackQueueContext` already imports `usePlaybackState` from `PlaybackStateContext` (line 10) — in the merged version the queue logic accesses playback state directly.

Export:
- `PlaybackProvider` — single provider
- `usePlayback()` — full combined value
- `usePlaybackState()` — backward-compat alias for playback state fields
- `usePlaybackQueue()` — backward-compat alias for queue fields
- All types: `PlaybackTrack`, `PlaybackPhase`, `QueueTrack`, `QueueSourceType`, `QueueSource`

**Update:** `src/providers/AppProviders.tsx` — Replace nested `PlaybackStateProvider` + `PlaybackQueueProvider` (lines 28–32) with single `PlaybackProvider`.

**Update all import sites** (~17 files). The hook names stay the same, only import paths change:
- `from '../contexts/PlaybackStateContext'` → `from '../contexts/PlaybackContext'`
- `from '../../contexts/PlaybackStateContext'` → `from '../../contexts/PlaybackContext'`
- `from '../contexts/PlaybackQueueContext'` → `from '../contexts/PlaybackContext'`
- `from '../../contexts/PlaybackQueueContext'` → `from '../../contexts/PlaybackContext'`

**Delete** old files after all imports are updated:
- `src/contexts/PlaybackStateContext.tsx`
- `src/contexts/PlaybackQueueContext.tsx`

---

## TASK 11 — Split SubscriptionContext into data and actions

**File:** `src/contexts/SubscriptionContext.tsx`

Create two contexts inside the same file:

**Data context** (changes frequently):
```typescript
interface SubscriptionDataValue {
  isInitialized: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  creditsOffering: PurchasesOffering | null;
  isLoading: boolean;
  isPremium: boolean;
  currentTier: string;
  currentBillingPeriod: string | null;
  tierConfig: any;
  canGenerateMusic: boolean;
  generationLimit: any;
  subscriptionConfig: any;
}
```

**Actions context** (stable functions):
```typescript
interface SubscriptionActionsValue {
  refreshCustomerInfo: () => Promise<void>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  purchaseCredits: (product: PurchasesStoreProduct) => Promise<boolean>;
  restorePurchases: () => Promise<void>;
  showPaywall: () => Promise<void>;
  showCustomerCenter: () => Promise<void>;
}
```

Nest both providers in SubscriptionProvider. Wrap each value in its own `useMemo`.

Export three hooks:
```typescript
export function useSubscriptionData() { /* reads SubscriptionDataContext */ }
export function useSubscriptionActions() { /* reads SubscriptionActionsContext */ }
export function useSubscription() { return { ...useSubscriptionData(), ...useSubscriptionActions() }; }
```

No consumer file changes needed — `useSubscription()` still works.

---

## VERIFICATION

After all 11 tasks, confirm:
1. `npx tsc --noEmit` — zero errors
2. No `ActivityIndicator` in `AlbumsScreen.tsx` or `AlbumDetailScreen.tsx`
3. No controller imports/JSX in `app/_layout.tsx`
4. All 6 controllers present in `app/(user)/_layout.tsx`
5. `src/components/playlists/CreatePlaylistModal.tsx` exists
6. `fontWeights` exported from `typography.ts` and `index.ts`
7. `ANIMATION.skeleton` exists in `constants.ts`
8. No `duration: 200` in CollapsibleSection, no `duration: 800` in SkeletonLoaders
9. No `'#ef4444'` in BatchAlbumCreationModal/ChapterPickerModal, no `'#FFD700'` in SelectableText, no `'#FFFFFF'` in ErrorState/CollapsibleLanguageSelector
10. `src/stores/createGenerationStore.ts` exists
11. `src/contexts/PlaybackContext.tsx` exists; old PlaybackStateContext.tsx and PlaybackQueueContext.tsx deleted
12. No imports from deleted context files remain
13. `useSubscriptionData` and `useSubscriptionActions` exported from SubscriptionContext
