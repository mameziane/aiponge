# AIPONGE Translation Brief

## Purpose
This document provides guidance for translating AIPONGE's content into other languages while preserving the emotional tone and voice that makes the app feel like a supportive companion rather than a clinical tool.

## Core Mission
**Help people feel what they already know.**

AIPONGE bridges the gap between understanding and emotional embodiment through personalized music. Every piece of text should support this mission.

## Voice Principles

### The Voice Feels Like:
- A wise friend who has been through hard things
- Someone who validates before advising
- Warm but not saccharine
- Confident but not clinical
- Personal but not intrusive
- Poetic but not obscure

### The Voice Does NOT Feel Like:
- A therapist (too clinical)
- A meditation app (too calming/detached)
- A tech product (too feature-focused)
- A self-help book (too preachy)
- A wellness brand (too aspirational)

## Translation Guidelines

### 1. Preserve Emotional Tone Over Literal Meaning

**Don't translate word-for-word.** Translate the feeling.

Example:
- English: "Whatever's true."
- ❌ Bad German: "Was auch immer wahr ist."
- ✅ Good German: "Was gerade echt für dich ist."

The phrase gives permission to be messy and honest. Find the equivalent permission-giving phrase in the target language.

### 2. Maintain Warmth in Each Language's Idiom

Different languages express warmth differently:
- **German**: Directness can feel caring (less hedging)
- **French**: Elegance and indirectness feel respectful
- **Spanish**: Warmth through diminutives and inclusivity
- **Japanese**: Indirectness and honorific language show care
- **Arabic**: Poetry and metaphor carry emotional weight

### 3. Avoid Clinical Terms in ALL Languages

These concepts should be expressed in everyday language:

| Avoid | Use Instead |
|-------|-------------|
| Therapeutic | Helpful, supportive |
| Mental wellness | How you're feeling |
| Analyze | Understand, explore |
| Process (as verb) | Work through, sit with |
| Healing journey | What you're going through |

### 4. Cultural Adaptation of Key Metaphors

**"Head to heart"** - This central metaphor may need different framing:
- Some cultures emphasize gut/stomach over heart
- Some use chest/breath as center of emotion
- Find the cultural equivalent of "knowing vs. feeling"

**"Music that reaches you"** - The concept of music bypassing defenses:
- May translate as "music that touches" in Romance languages
- May need sensory metaphors in others

### 5. Permission-Giving Phrases

These phrases are critical and need cultural equivalents:

| English | Intent |
|---------|--------|
| "Whatever's true" | You don't have to be polished |
| "When you're ready" | No pressure, you're in control |
| "No right way to say it" | There's no judgment here |
| "This wasn't you" | Removing self-blame for errors |
| "Just notice" | You don't have to act or respond |

### 6. Error Messages: Remove Blame

Error messages must NEVER imply user fault:

| ❌ Avoid | ✅ Use Instead |
|----------|----------------|
| "Invalid input" | "Something doesn't look quite right" |
| "You need to..." | "Let's try..." |
| "Please provide" | "When you're ready" |
| "Failed" | "Something didn't work" |

## Priority Content for Translation

### Tier 1: Critical Path (Translate First)
1. **Onboarding slides** (`onboarding.*`)
2. **Entry input placeholder** (`create.entryPlaceholder`)
3. **Generation loading states** (`create.generating*`)
4. **Error messages** (`errors.*`, `hooks.musicGeneration.*`)
5. **Welcome screen** (`welcome.*`)

### Tier 2: Core Experience
6. Song delivery messages (`create.songReady`, `myMusic.firstSongReady`)
7. Empty states (`emptyState.*`)
8. Guest conversion (`guest.conversionPrompt`)
9. Post-listening prompts (`player.postListening`)
10. Progress milestones (`progress.milestone`)

### Tier 3: Polish
11. All remaining user-facing text
12. Help content
13. Settings and preferences

## Key New Content Requiring Translation

These keys were added in this content enhancement:

```
welcome.returning.*
guest.conversionPrompt.*
help.crisisBoundary.*
player.postListening.*
create.songReady.*
myMusic.firstSongReady.*
education.dimensionIntro.*
progress.milestone.*
```

## Quality Criteria

A successful translation:
- [ ] Passes the "wise friend test" — sounds like something a caring person would say
- [ ] Never sounds clinical or medical
- [ ] Maintains permission-giving tone
- [ ] Removes all blame language in errors
- [ ] Uses the language's natural way of expressing warmth
- [ ] Feels native, not translated

## Languages

Translate in this order based on user base:
1. en-US.json (source of truth - complete)
2. fr-FR.json
3. de-DE.json
4. es-ES.json
5. pt-BR.json
6. ja-JP.json
7. ar.json (note: RTL support required)

## Contact

For questions about voice and tone, refer to `docs/content-review-and-guidelines.md` for detailed guidance on AIPONGE's content philosophy.
