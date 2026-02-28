# TIER_SPEC v2.0 — Implementation Clarifications

**Context:** This document clarifies implementation intent for the revised tier specification (TIER_SPEC.json v2.0, dated 2026-02-14). Read this alongside the spec. These aren't changes — they're details the spec implies but doesn't spell out explicitly. Each section addresses a likely point of ambiguity.

---

## 1. Guest → Explorer Is Account Creation, Not an Upgrade

**The problem it solves:** In the old spec, Guest → Starter was a paywall transition. The new Guest → Explorer transition is fundamentally different — it's a free account creation. The implementation must reflect this.

**What to build:**

```
Guest generates song
  → Song plays (full quality, no watermark, no truncation)
  → After first listen completes, show:
      "This song was made from your words. Save it before it's gone."
      [Keep this song] ← primary CTA
  → Tapping "Keep this song" opens account creation:
      Email + password (or OAuth)
      NO pricing screen
      NO tier comparison
      NO "choose your plan"
  → On account creation:
      User becomes Explorer
      Song is saved to their library
      Disappearing timer stops
      Redirect to library with their song
```

**What NOT to build:**

- No upgrade flow UI
- No tier comparison modal
- No pricing information shown during this transition
- No "you're now on the Explorer plan!" celebration screen — just show them their song in their library

**The mental model:** This is like Spotify asking you to create an account to save a playlist someone shared with you. It's preservation, not purchase.

---

## 2. Disappearing Song Mechanic — Technical Requirements

**New fields:** `songExpiresAfterHours: 48` and `showDisappearingSongTimer: true` on the Guest tier.

**Backend:**

- Guest-generated songs need a `createdAt` timestamp and an `expiresAt` field set to `createdAt + 48h`
- A cleanup job (cron or TTL-based) should soft-delete or archive expired guest songs
- If the guest creates an account before expiry, set `expiresAt = null` on all their songs (migrate to permanent storage)
- Songs should remain playable during the entire 48h window — expiry means disappearance, not degradation

**Frontend:**

- Show a gentle, non-intrusive timer on the song player screen: "Available for 47 hours"
- Timer formatting:
  - `> 24h`: "Available for X hours" (no minutes)
  - `2-24h`: "Available for X hours"
  - `< 2h`: "Disappears in X minutes" (increase visual urgency slightly — bolder text, not a popup)
  - `< 15min`: "Almost gone. Save it now." with the account creation CTA more prominent
- The timer should NOT block playback, overlay the player, or interrupt listening
- After expiry: if the guest returns to the URL, show: "This song has expired. Create a free account to make a new one." with a CTA to start fresh

**Edge cases:**

- Guest generates a song, closes the app, returns 47 hours later → song still plays, timer shows ~1 hour remaining
- Guest generates a song, shares the URL with someone, then the song expires → shared URL should also expire. The recipient sees: "This song is no longer available."
- Guest creates account at hour 47 → song is saved permanently, timer disappears

---

## 3. Sharing on Explorer — The Viral Loop

**Intent:** When an Explorer shares a song, the recipient must be able to listen WITHOUT creating an account. This is a distribution mechanism, not a social feature.

**What to build:**

```
Explorer taps "Share" on a song
  → Generates a token-based share link (existing infrastructure)
  → Link can be sent via any channel (copy to clipboard, native share sheet)

Recipient opens link
  → Song plays immediately. No login wall. No signup prompt before playback.
  → Below the player, show:
      Song title / theme
      "Made with AIPONGE"
      [Make your own song] ← CTA linking to the guest song creation flow
  → The recipient is now a potential Guest entering the funnel
```

**What NOT to build:**

- No "sign up to listen" gate
- No "create account to see full song" truncation
- No mandatory email capture before playback

**The metric to track:** Share link → recipient opens → recipient taps "Make your own song" → recipient generates their own song. This is the viral coefficient. Log each step.

**Visibility model alignment:** This uses the existing three-tier visibility system. Shared songs via token links are "Shared" visibility. The recipient accesses via the token, not via authentication.

---

## 4. Personal → Practice Upgrade Trigger Is Behavioral, Not Quota-Based

**This is different from every other tier transition.** Guest → Explorer is triggered by wanting to save. Explorer → Personal is triggered by wanting more songs and control. But Personal → Practice should NOT be triggered by hitting the 15-song limit.

**What triggers the Practice upgrade prompt:**

- User has shared songs with 3+ distinct recipients in the past 30 days
- User generates songs with notably different emotional contexts in the same session (suggesting they're creating for others, not just themselves)
- User explicitly searches for or mentions "client," "session," or "share with" in the app
- User hits the sharing limit or asks for reflection/feedback features

**What does NOT trigger the Practice upgrade prompt:**

- Hitting the 15 songs/month limit → show the standard "More available {{resetDate}}" message, NOT the Practice upsell
- Running low on lyrics credits → show reset date
- General high usage → not a signal for Practice, just an engaged personal user

**Implementation suggestion:** Create a `professionalUsageSignal` score that increments based on the behavioral triggers above. When it crosses a threshold (suggest: 3+ signals in 30 days), show a contextual prompt:

> "It looks like you're sharing songs with others. Want to see how they respond? Practice gives you reflection capture and engagement analytics."

This prompt should appear in context (e.g., after sharing a song) rather than as a random modal.

---

## 5. Replay Tracking Starts at Guest Tier — Anonymous Session Tracking

**This is the North Star metric for the entire product.** Song replay rate (target: 3+ replays per week) must be tracked from the very first interaction, including for guests who have no account.

**Guest tier tracking (pre-authentication):**

- Generate a unique anonymous session ID (stored in device storage / cookie)
- Log every play event: `{ sessionId, songId, timestamp, duration, completedFullListen: bool }`
- Track replay specifically: same `songId` played more than once by the same `sessionId`

**On account creation (Guest → Explorer):**

- Migrate all play events from the anonymous `sessionId` to the new `userId`
- The user's replay history should be seamless — they don't "start over" on engagement data

**For all tiers:**

- Every song play must be logged: `{ userId (or sessionId), songId, tierAtTimeOfPlay, timestamp, listenDurationSeconds, isReplay: bool, isSharedSong: bool }`
- `isReplay` = true when the same user/session plays the same song more than once
- Aggregate metrics needed at the analytics layer:
  - Replay rate per user (plays / unique songs)
  - Replay frequency (average time between replays of the same song)
  - Songs with highest replay rates (content quality signal)
  - Replay rate by tier (to correlate with conversion)
  - Replay rate by framework (to measure which frameworks produce the most resonant songs)

**This tracking infrastructure is higher priority than the Practice and Studio tiers.** Ship it with Guest and Explorer at launch.

---

## 6. Weekly Billing Removal — Migration Checklist

The old spec included weekly product IDs:

- `subscription_weekly_starter`
- `subscription_weekly_premium`

**Before removing:**

1. Confirm zero active weekly subscribers in RevenueCat dashboard
1. If any exist, plan a migration path (notify user, offer monthly at prorated rate)

**Removal steps:**

1. Remove weekly product IDs from `subscription.types.ts`
1. Remove weekly pricing from `tierDisplayConfig.ts`
1. Archive (don't delete) weekly products in RevenueCat — keep for historical data
1. In App Store Connect / Google Play Console: set weekly subscription products to "removed from sale" (don't delete — preserves purchase records)
1. Remove "weekly" from `billingPeriods` in the global config (already done in new spec — just verify it propagates)

---

## 7. Deferred Tiers Must Be Invisible at Launch

`tierClassification.launchTiers: ["guest", "explorer", "personal"]`
`tierClassification.deferredTiers: ["practice", "studio"]`

**What this means in practice:**

- The paywall / pricing screen only shows Explorer and Personal
- No mention of Practice or Studio anywhere in the UI — not in feature comparison tables, not in "coming soon" teasers, not in marketing copy within the app
- The tier data for Practice and Studio should exist in the codebase (for architectural readiness) but be feature-flagged off
- Suggested feature flag: `ENABLE_PROFESSIONAL_TIERS = false`
- When flipped to `true`, Practice appears in the pricing screen and the behavioral upgrade prompt (section 4 above) activates
- Studio gets its own separate flag: `ENABLE_STUDIO_TIER = false`

**Why no "coming soon" teaser:** We don't want users waiting for a future tier instead of converting to Personal now. The Personal tier should feel complete, not like a stepping stone to something better that hasn't launched yet.

---

## 8. Sharing Clarification: Personal vs Practice

**The gap in the spec:** Personal has `canShareSongs: true` but does NOT have `canShareWithClients`. Practice has both. From the user's perspective, the action of sharing is identical — they send a link. So what's the actual difference?

**Here's the distinction:**

| Capability                                     | Explorer | Personal | Practice     |
| ---------------------------------------------- | -------- | -------- | ------------ |
| Share a song via link                          | ✅       | ✅       | ✅           |
| Recipient can listen without account           | ✅       | ✅       | ✅           |
| See if recipient listened                      | ❌       | ❌       | ✅           |
| See how many times recipient replayed          | ❌       | ❌       | ✅           |
| Capture recipient's reflection after listening | ❌       | ❌       | ✅           |
| View engagement dashboard for shared songs     | ❌       | ❌       | ✅           |
| "Created with AIPONGE" on shared song page     | ✅       | ✅       | ✅ (branded) |

**Implementation:**

- The sharing mechanism (token link generation, recipient playback page) is the SAME across all tiers
- The difference is the **feedback layer**: Practice adds tracking, reflection capture, and analytics on top of the same share infrastructure
- For Explorer and Personal users: sharing works, the song plays for the recipient, but the sharer gets no data back about what happened
- For Practice users: sharing works AND the sharer gets a dashboard showing: who listened, when, how many times, and what they reflected

**The upgrade moment:** A Personal user shares a song with someone. That person loves it and tells them. The Personal user thinks "I wish I could see if my other clients listened too." THAT is the natural moment where Practice becomes valuable. The sharing worked — they just want visibility into the result.

**Do NOT:**

- Block Personal users from sharing with a "upgrade to Practice to share with clients" message
- Add any friction to the Personal sharing flow
- Distinguish between "sharing with a friend" and "sharing with a client" at the Personal tier — there is no distinction. A link is a link.

---

## 9. Annual Pricing — Available But Hidden

The spec includes annual pricing for Personal ($79.99), Practice ($399.99), and Studio ($1199.99). These are in the schema for RevenueCat and App Store product setup, but:

**At launch:**

- Only show monthly pricing in the UI
- Do not create a monthly/annual toggle on the pricing screen
- Annual products should exist in RevenueCat and App Store Connect (so they're ready when needed) but should not be surfaced in the app

**When to enable:**

- After 3-6 months of monthly churn data
- When monthly churn rate stabilizes and you can calculate whether annual discounts improve LTV
- Feature flag: `SHOW_ANNUAL_PRICING = false`

---

## Summary: Implementation Priority Order

For launch (Month 1-2), build in this order:

1. **Replay tracking infrastructure** (all tiers, including anonymous guest tracking) — this is the measurement foundation for everything
1. **Guest tier with disappearing song mechanic** — the acquisition funnel
1. **Guest → Explorer account creation flow** (NOT an upgrade flow) — the conversion moment
1. **Explorer tier with library, journal, and sharing** — the retention and distribution layer
1. **Share link recipient experience** (no-auth playback + "Make your own song" CTA) — the viral loop
1. **Weekly billing deprecation** — cleanup

For Month 3, add:

7. **Personal tier with framework selection, music style, Mentor Chat, books, calendar** — first revenue
8. **Explorer → Personal paywall** — conversion flow with tier comparison

Deferred (Month 4-5, feature-flagged):

9. **Practice tier with client sharing, reflections, engagement analytics**
10. **Behavioral upgrade trigger from Personal → Practice**

Deferred (Month 6+, feature-flagged):

11. **Studio tier**
12. **Annual pricing toggle**
