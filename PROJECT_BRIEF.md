# Margarita March

## Problem
Blake's friend group is hosting their annual crawl — this year the "Margarita March" on
September 12, 2026 in Indianapolis. Blake built La Lucha del Taco (a taco-crawl scorecard
app) for a similar event this past spring; it worked, but had rough edges worth fixing
before reusing the concept for a new theme.

## Who it's for
Blake's friend group. Friends are planning the stops/route; Blake builds and hosts the
app; all attendees join and use it live during the crawl.

## Core feature (v1)
A live, multiplayer crawl scorecard, carrying forward the proven loop from La Lucha del
Taco but under a new "Margarita March" theme (not a lucha libre reskin) and fixing known
pain points:

- **Room-based multiplayer** — shared room code, live-synced scoring/leaderboard across
  devices (same underlying approach as v1, open to architecture improvements).
- **Persistent sessions ("remember this device")** — a user who registered once should
  not have to re-enter their username on return visits, and should not silently become a
  "new user" from a device the app already knows. This directly fixes v1's biggest
  complaint.
- **On-the-fly stop editing** — friends are planning stops themselves and may need to
  change times/locations after the app is shared, so add/edit/remove stops must work
  live, same as v1.
- **New scoring categories relevant to margaritas** — replace the taco-themed categories
  (La Tortilla, El Relleno, etc.) with margarita-appropriate ones. Same slider/composite
  scoring mechanic as a fallback, but open to rethinking it if something better fits.
- **Badges** — keep the personality-badge concept from v1; open to suggestions on
  improving how badges are computed/presented.
- **Champion reveal** — keep the confetti/final-rankings reveal from v1.
- **Countdown timer** — keep from v1.
- **Photo uploads, fully built out this time** — v1 never finished this; it should be a
  real, working feature in v1 of this app rather than an afterthought.

## Later / maybe
- **Automatic stop-detail lookup** — pulling in address/lat-long automatically instead of
  manual entry was a pain in v1. How to solve this (geocoding API, pasting a maps link,
  etc.) is intentionally left open — don't lock in an approach yet.
- **Crowdsourced mini-games/challenges** — v1's challenge wheel was a rushed last-minute
  add with thin content. Worth doing this time, but only if done well (better content,
  actually integrated with scoring/badges) — not required for v1. Also flagged: last time
  attendees didn't have the app in hand long enough before the crawl to engage with this
  kind of feature, so lead time matters as much as the feature itself.

## Constraints
- V1 was a single self-contained `index.html`, vanilla JS, no build step, Firebase
  Realtime Database for sync (see `la-lucha-del-taco` repo for reference/architecture).
  Blake is open to changing this architecture if it meaningfully improves design or
  functionality — not required to carry it forward as-is.
- Friends control stop/route planning, not Blake — the app must support them changing
  stop details after the app is already shared with the group.
- No hard deadline before Sept 12, 2026, but Blake wants a working deliverable early
  enough to send to friends so they have real lead time to prep and share it with all
  attendees (addressing the late-onboarding problem from v1).

## Definition of done (v1)
Blake can hand friends a link. Attendees self-register once and are remembered on their
device afterward (no re-entering usernames). Friends can add/edit stops on the fly.
Scoring uses new margarita-relevant categories, synced live to a shared leaderboard.
Badges, champion reveal, countdown timer, and working photo uploads are all functional.
This is ready with enough lead time before Sept 12, 2026 for friends to try it and share
it with attendees ahead of the event.

## Non-goals
None identified yet — nothing explicitly ruled out at this stage.
