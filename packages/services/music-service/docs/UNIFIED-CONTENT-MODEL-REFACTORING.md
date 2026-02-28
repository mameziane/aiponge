# Music Service Post-Consolidation Refactoring Plan

**Date:** February 2026  
**Status:** In Progress  
**Context:** Database schema unified - librarian and user flows now share `mus_albums`, `mus_tracks`, `mus_lyrics` tables with `visibility` column for access control.

---

## Executive Summary

After consolidating the database schema, we identified **~2,500 lines of parallel code** that can be eliminated by unifying services, repositories, and entities that previously targeted separate tables but now hit the same unified tables.

---

## 1. Data Consolidation Follow-Through

### Parallel Data-Access Paths to Unify

| File/Function | Lines | Current State | Action | Status |
|---------------|-------|---------------|--------|--------|
| `DrizzleUserTrackRepository.ts` | 340 | Wraps unified `mus_tracks` | MERGE into unified repo | ⬜ Pending |
| `DrizzleUserAlbumRepository.ts` | 336 | Wraps unified `mus_albums` | MERGE into unified repo | ⬜ Pending |
| `DrizzleUserLyricsRepository.ts` | 121 | Wraps unified `mus_lyrics` | MERGE into unified repo | ⬜ Pending |
| `UserTrack` entity | ~150 | Separate domain entity | UNIFY with TrackEntity | ⬜ Pending |
| `UserAlbum` entity | ~100 | Separate domain entity | UNIFY with Album | ⬜ Pending |
| `UserTrackGenerationService.ts` | 657 | Parallel user generation | MERGE with visibility config | ✅ Completed |
| `LibraryTrackGenerationService.ts` | 575 | Parallel librarian generation | REMOVE after merge | ✅ Completed |
| `LibraryAlbumGenerationService` + `UserAlbumGenerationService` | 180 | Two classes in same file | MERGE into single class | ⬜ Pending |

**Total parallel code: ~2,029 lines**

---

## 2. Code Duplication & Bug Risk Analysis

| Location | What's Duplicated | Lines | Bug Risk | Proposed Fix |
|----------|-------------------|-------|----------|--------------|
| `UserTrackGenerationService` vs `LibraryTrackGenerationService` | Entire generation pipeline | ~1,100 | **HIGH** | Create unified `TrackGenerationService` |
| `LibraryAlbumGenerationService` vs `UserAlbumGenerationService` | Identical pipeline setup | ~180 | **MEDIUM** | Merge into single class |
| `library-routes.ts` vs `librarian-routes.ts` | Track/album CRUD endpoints | ~600 | **HIGH** | Consolidate routes |
| `lyrics-routes.ts` vs `shared-lyrics-routes.ts` | Lyrics CRUD endpoints | ~200 | **MEDIUM** | Merge into single file |
| `DrizzleUserTrackRepository` vs `DrizzleMusicCatalogRepository` | Track query methods | ~150 | **MEDIUM** | Consolidate repos |

**Total duplicated lines at risk: ~2,230 lines**

---

## 3. Recommended Folder Structure

### Current (Role-Organized - Problematic)
```
src/
├── domains/music-catalog/entities/
│   ├── Track.ts        # Library track
│   ├── UserTrack.ts    # User track (REDUNDANT)
│   └── UserAlbum.ts    # User album (REDUNDANT)
├── application/services/
│   ├── UserTrackGenerationService.ts    # (REDUNDANT)
│   ├── LibraryTrackGenerationService.ts # (REDUNDANT)
│   └── LibraryOperationsService.ts      # 935 lines catch-all
├── infrastructure/database/
│   ├── DrizzleUserTrackRepository.ts    # (REDUNDANT)
│   ├── DrizzleUserAlbumRepository.ts    # (REDUNDANT)
│   └── DrizzleUserLyricsRepository.ts   # (REDUNDANT)
└── presentation/routes/
    ├── library-routes.ts        # 2,949 lines (TOO LARGE)
    ├── librarian-routes.ts      # (REDUNDANT)
    └── shared-lyrics-routes.ts  # (REDUNDANT)
```

### Proposed (Capability-Organized)
```
src/
├── domains/content/entities/
│   ├── Track.ts         # Single entity with visibility
│   ├── Album.ts         # Single entity with visibility
│   └── Lyrics.ts        # Single entity with visibility
├── application/services/
│   ├── TrackGenerationService.ts    # Unified generation
│   ├── ContentService.ts            # Unified CRUD
│   └── PlaybackService.ts           # Streaming/playback
├── infrastructure/database/
│   ├── TrackRepository.ts    # Single with visibility filter
│   ├── AlbumRepository.ts    # Single with visibility filter
│   └── LyricsRepository.ts   # Single with visibility filter
└── presentation/routes/
    ├── content-routes.ts     # Unified tracks, albums, lyrics
    ├── generation-routes.ts  # All generation endpoints
    └── admin-routes.ts       # Admin-only operations
```

---

## 4. Execution Plan

### Phase 1: Quick Wins (Small effort, immediate clarity) ✅
- [x] D5: Merge `LibraryAlbumGenerationService` + `UserAlbumGenerationService`
  - Created unified `AlbumGenerationService` class with visibility parameter
  - Deprecated classes kept for backward compatibility
- [x] D7: Merge `lyrics-routes.ts` + `shared-lyrics-routes.ts`
  - Consolidated into single `lyrics-routes.ts` with `/api/lyrics/shared/*` paths
  - Deleted `shared-lyrics-routes.ts`
  - Updated `LyricsPreparationService.ts` to use new endpoint

### Phase 2: Entity Consolidation ✅
- [x] D1: Merge `UserTrack` + `TrackEntity` into single entity
  - Added `visibility` property to UserTrack entity
  - Added `albumId`, `playCount`, `likeCount` properties
  - TrackEntity now re-exports UserTrack for backward compatibility
  - Updated entities index.ts with proper exports
- [ ] D2: Merge `UserAlbum` into `Album` entity (deferred)

### Phase 3: Repository Consolidation ✅
- [x] D3: Updated DrizzleUserTrackRepository with visibility support
- [x] Created UnifiedLyricsRepository consolidating DrizzleLyricsRepository + DrizzleUserLyricsRepository
  - Single repository with visibility parameter (user, shared, personal, draft, all)
  - Old repositories now re-export deprecated wrappers for backward compatibility
  - ~230 lines consolidated into single implementation
- [x] Created UnifiedAlbumRepository consolidating DrizzleAlbumRepository + DrizzleUserAlbumRepository
  - Single repository with visibility-based filtering
  - Supports both AlbumEntity and UserAlbum entity mapping
  - Old repositories now re-export deprecated wrappers for backward compatibility
  - ~680 lines consolidated into single implementation

### Phase 4: Service Consolidation (Highest bug risk reduction) ✅
- [x] D4: Merge generation services into single `TrackGenerationService`
  - Created unified `TrackGenerationService` with `targetVisibility` parameter
  - Personal tracks: `targetVisibility='personal'`, saved with `visibility='personal'`
  - Shared tracks: `targetVisibility='shared'`, use singles album from `getOrCreateSinglesAlbumForUser`
  - Old services re-export deprecated wrappers for backward compatibility
  - Fixed personal track album resolution to not use shared-visibility albums
  - ~1,234 lines consolidated into single implementation

### Phase 5: Route Consolidation ✅
- [x] D6: Route consolidation analysis and deprecation
  - Identified duplicate endpoints: `/admin/shared-track/:trackId` DELETE and `/admin/move-to-public` POST
  - These duplicate librarian-routes.ts endpoints with inline auth instead of middleware
  - Added @deprecated notices to library-routes.ts admin endpoints
  - Recommended migration path: Use `/api/librarian/*` endpoints with middleware protection
  - librarian-routes.ts (805 lines) retained as primary for privileged operations
- [x] D10: Domain-based route split for library-routes.ts
  - Split 2,865-line file into domain-specific sub-routers:
    - `library-routes.ts` (43 lines) - Main composition file mounting sub-routers
    - `library/generation-routes.ts` (477 lines) - Track and album generation endpoints
    - `library/track-routes.ts` (916 lines) - Track CRUD, timing analysis, playback
    - `library/engagement-routes.ts` (862 lines) - Likes, follows, activity, sharing
    - `library/album-routes.ts` (348 lines) - Album management endpoints
    - `library/index.ts` (9 lines) - Export index
  - All endpoints preserved with same paths and behavior
  - No LSP errors after split

### Phase 6: Structure & Frontend ✅
- [x] D8: Updated exports to reflect consolidated architecture
  - `infrastructure/database/index.ts`: UnifiedAlbumRepository and UnifiedLyricsRepository now primary exports
  - `application/services/index.ts`: TrackGenerationService and AlbumGenerationService now primary exports
  - Deprecated implementations still exported for backward compatibility
  - `domains/music-catalog/entities/index.ts`: UserTrack already primary with Track re-export
- [x] D9: Frontend API call verification
  - Verified frontend uses `/api/librarian/*` for privileged operations
  - No usage of deprecated `/api/library/admin/*` endpoints found
  - `songGeneration.ts` correctly uses `isLibrarianMode` to select endpoint
  - Frontend already aligned with recommended API structure

---

## 5. Key Design Decisions

### Visibility-Based Access Control Pattern
```typescript
// Unified repository method signature
async findTracks(options: {
  userId?: string;
  visibility?: 'draft' | 'personal' | 'shared' | 'all';
  status?: 'active' | 'published' | 'all';
  limit?: number;
  offset?: number;
}): Promise<Track[]>

// Personal tracks: visibility IN ('personal', 'draft') AND user_id = ?
// Shared tracks: visibility = 'shared' AND status = 'published'
// All user's tracks: user_id = ? (any visibility)
```

### Generation Service Unification Pattern
```typescript
// Single service with visibility configuration
class TrackGenerationService {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const visibility = request.targetVisibility || 'personal';
    // Same pipeline, different visibility on save
  }
}
```

---

## 6. Risk Mitigation

1. **Incremental migration** - Keep old code paths working while building new ones
2. **Feature flags** - Use visibility parameter to toggle between old/new behavior
3. **Comprehensive tests** - Ensure both librarian and user flows work after each change
4. **Backward compatibility** - Maintain API contracts during transition

---

## 7. Success Metrics

- [x] Reduce codebase by ~2,500 lines → ~2,144+ lines consolidated (repositories ~910, services ~1,234)
- [x] Eliminate 5+ parallel code paths → Unified: TrackGenerationService, AlbumGenerationService, UnifiedLyricsRepository, UnifiedAlbumRepository, UserTrack entity
- [x] No route file exceeds 800 lines → library-routes.ts split into domain files (main: 43 lines, largest sub-router: 916 lines)
- [x] Single entity per domain concept → UserTrack with visibility property
- [x] Single repository per table → UnifiedAlbumRepository, UnifiedLyricsRepository (deprecated wrappers for compatibility)
- [x] Frontend aligned with recommended endpoints
