// Badge engine. Each badge owns a predicate over shared context + a user, returning
// either false or {earned: true, stopIds: [...]}. computeAllBadges() runs every
// predicate exactly once and derives both the per-user and per-stop badge maps from the
// same pass — this is the fix for the old app's biggest badge problem: it computed the
// same 14 conditions twice (once per-user, once per-stop) with copy-pasted logic that
// could drift out of sync. Helpers below take a category key as a parameter rather than
// a hardcoded literal, so badges stay correct if categories.js ever changes.

import { CATEGORIES } from './categories.js';
import { getAggregatedScores, getUserComposite } from './scoring.js';

function userRatedStopIds(ctx, user) {
  return Object.keys(ctx.allRatings[user] || {});
}

function userComposite(ctx, user, stopId) {
  const scores = ctx.allRatings[user]?.[stopId];
  return scores ? getUserComposite(scores) : null;
}

// Stops (with stopIds) where `categoryKey` was this user's single highest-rated category.
function topCategoryStops(ctx, user, categoryKey) {
  return userRatedStopIds(ctx, user).filter((stopId) => {
    const scores = ctx.allRatings[user][stopId];
    const maxVal = Math.max(...CATEGORIES.map((c) => scores[c.key] ?? 0));
    return (scores[categoryKey] ?? 0) === maxVal;
  });
}

// Stops where `categoryKey` was this user's single lowest-rated category.
function lowCategoryStops(ctx, user, categoryKey) {
  return userRatedStopIds(ctx, user).filter((stopId) => {
    const scores = ctx.allRatings[user][stopId];
    const minVal = Math.min(...CATEGORIES.map((c) => scores[c.key] ?? 10));
    return (scores[categoryKey] ?? 10) === minVal;
  });
}

// Builds the shared context every predicate reads from: per-stop group averages
// (reused from scoring.js, not recomputed), and each user's own average composite
// (needed for the "pickiest"/"most generous" global badges).
export function buildBadgeContext(stops, allRatings) {
  const users = Object.keys(allRatings);
  const groupAvgByStop = Object.fromEntries(
    getAggregatedScores(stops, allRatings).map((s) => [s.id, s.composite])
  );

  const avgCompositeByUser = {};
  users.forEach((user) => {
    const stopIds = userRatedStopIds({ allRatings }, user);
    if (!stopIds.length) {
      avgCompositeByUser[user] = null;
      return;
    }
    const total = stopIds.reduce((sum, id) => sum + getUserComposite(allRatings[user][id]), 0);
    avgCompositeByUser[user] = total / stopIds.length;
  });

  const ratedUsers = users.filter((u) => avgCompositeByUser[u] != null);
  let pickiestUser = null;
  let mostGenerousUser = null;
  if (ratedUsers.length > 1) {
    pickiestUser = ratedUsers.reduce((a, b) => (avgCompositeByUser[a] <= avgCompositeByUser[b] ? a : b));
    mostGenerousUser = ratedUsers.reduce((a, b) => (avgCompositeByUser[a] >= avgCompositeByUser[b] ? a : b));
  }

  return { users, stops, allRatings, groupAvgByStop, avgCompositeByUser, pickiestUser, mostGenerousUser };
}

export const BADGES = [
  {
    id: 'contrarian', emoji: '🔥', title: 'The Contrarian',
    desc: "Composite score deviated 2.0+ points from the group average, at least once",
    predicate: (ctx, user) => {
      const stopIds = userRatedStopIds(ctx, user).filter((stopId) => {
        const groupAvg = ctx.groupAvgByStop[stopId];
        const comp = userComposite(ctx, user, stopId);
        return groupAvg != null && Math.abs(comp - groupAvg) >= 2.0;
      });
      return stopIds.length ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'consensus', emoji: '🎯', title: 'The Consensus Builder',
    desc: 'Landed within 0.3 points of the group average on 2+ stops',
    predicate: (ctx, user) => {
      const stopIds = userRatedStopIds(ctx, user).filter((stopId) => {
        const groupAvg = ctx.groupAvgByStop[stopId];
        const comp = userComposite(ctx, user, stopId);
        return groupAvg != null && Math.abs(comp - groupAvg) <= 0.3;
      });
      return stopIds.length >= 2 ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'critic', emoji: '👑', title: 'The Critic',
    desc: 'Pickiest marcher — lowest average composite score',
    predicate: (ctx, user) =>
      user === ctx.pickiestUser ? { earned: true, stopIds: userRatedStopIds(ctx, user) } : false,
  },
  {
    id: 'cheerleader', emoji: '🤡', title: 'The Cheerleader',
    desc: 'Most generous marcher — highest average composite score',
    predicate: (ctx, user) =>
      user === ctx.mostGenerousUser ? { earned: true, stopIds: userRatedStopIds(ctx, user) } : false,
  },
  {
    id: 'earlybird', emoji: '⚡', title: 'The Early Bird',
    desc: 'First to submit ratings at 2+ stops',
    predicate: (ctx, user) => {
      const stopIds = ctx.stops.filter((stop) => {
        let minTime = Infinity, minUser = null;
        ctx.users.forEach((u) => {
          const r = ctx.allRatings[u][stop.id];
          if (r && r.submittedAt < minTime) { minTime = r.submittedAt; minUser = u; }
        });
        return minUser === user;
      }).map((s) => s.id);
      return stopIds.length >= 2 ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'straggler', emoji: '🐢', title: 'The Straggler',
    desc: 'Last to submit ratings at 2+ stops',
    predicate: (ctx, user) => {
      const stopIds = ctx.stops.filter((stop) => {
        let maxTime = -Infinity, maxUser = null;
        ctx.users.forEach((u) => {
          const r = ctx.allRatings[u][stop.id];
          if (r && r.submittedAt > maxTime) { maxTime = r.submittedAt; maxUser = u; }
        });
        return maxUser === user;
      }).map((s) => s.id);
      return stopIds.length >= 2 ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'connoisseur', emoji: '🥃', title: 'The Connoisseur',
    desc: 'The Pour was the top-rated category 2+ times',
    predicate: (ctx, user) => {
      const stopIds = topCategoryStops(ctx, user, 'pour');
      return stopIds.length >= 2 ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'xfactor', emoji: '🃏', title: 'The X-Factor',
    desc: 'The Wildcard was the top-rated category 2+ times',
    predicate: (ctx, user) => {
      const stopIds = topCategoryStops(ctx, user, 'wildcard');
      return stopIds.length >= 2 ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'cheapskate', emoji: '💰', title: 'The Cheapskate',
    desc: 'Rated The Value the lowest category 2+ times',
    predicate: (ctx, user) => {
      const stopIds = lowCategoryStops(ctx, user, 'value');
      return stopIds.length >= 2 ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'vibecurator', emoji: '🎭', title: 'The Vibe Curator',
    desc: 'The Vibe was the top-rated category 2+ times',
    predicate: (ctx, user) => {
      const stopIds = topCategoryStops(ctx, user, 'vibe');
      return stopIds.length >= 2 ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'rivalry', emoji: '⚔️', title: 'The Rivalry',
    desc: "Composite score differed by 3+ points from someone else's, on the same stop",
    predicate: (ctx, user) => {
      const myComp = (stopId) => userComposite(ctx, user, stopId);
      const stopIds = userRatedStopIds(ctx, user).filter((stopId) => {
        const others = ctx.users.filter((u) => u !== user && ctx.allRatings[u][stopId]);
        return others.some((u) => Math.abs(userComposite(ctx, u, stopId) - myComp(stopId)) >= 3);
      });
      return stopIds.length ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'twins', emoji: '🤝', title: 'The Twins',
    desc: "Landed within 0.2 points of another marcher's score on 2+ stops",
    predicate: (ctx, user) => {
      const myComp = (stopId) => userComposite(ctx, user, stopId);
      const stopIds = userRatedStopIds(ctx, user).filter((stopId) => {
        const others = ctx.users.filter((u) => u !== user && ctx.allRatings[u][stopId]);
        return others.some((u) => Math.abs(userComposite(ctx, u, stopId) - myComp(stopId)) <= 0.2);
      });
      return stopIds.length >= 2 ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'steadyhand', emoji: '📊', title: 'The Steady Hand',
    desc: 'Never gave a 1 or a 10 in any category',
    predicate: (ctx, user) => {
      const stopIds = userRatedStopIds(ctx, user);
      if (!stopIds.length) return false;
      const neverExtreme = stopIds.every((stopId) =>
        CATEGORIES.every((c) => {
          const v = ctx.allRatings[user][stopId][c.key];
          return v !== 1 && v !== 10;
        })
      );
      return neverExtreme ? { earned: true, stopIds } : false;
    },
  },
  {
    id: 'fullsend', emoji: '🎉', title: 'Full Send',
    desc: 'Gave both a 1 and a 10 in the same stop',
    predicate: (ctx, user) => {
      const stopIds = userRatedStopIds(ctx, user).filter((stopId) => {
        const scores = ctx.allRatings[user][stopId];
        const vals = CATEGORIES.map((c) => scores[c.key]);
        return vals.includes(1) && vals.includes(10);
      });
      return stopIds.length ? { earned: true, stopIds } : false;
    },
  },
];

// Single computation pass: every predicate runs once per user, and both the by-user and
// by-stop maps are built from that same result (no duplicated logic, unlike the old app).
export function computeAllBadges(ctx) {
  const badgesByUser = {};
  const badgesByStop = {};

  BADGES.forEach((badge) => {
    ctx.users.forEach((user) => {
      const result = badge.predicate(ctx, user);
      if (!result || !result.earned) return;

      badgesByUser[user] = badgesByUser[user] || [];
      badgesByUser[user].push(badge.id);

      (result.stopIds || []).forEach((stopId) => {
        badgesByStop[stopId] = badgesByStop[stopId] || {};
        badgesByStop[stopId][user] = badgesByStop[stopId][user] || [];
        badgesByStop[stopId][user].push(badge.id);
      });
    });
  });

  return { badgesByUser, badgesByStop };
}

export function getBadge(id) {
  return BADGES.find((b) => b.id === id);
}

export function getBadgeEmojisForStop(badgesByStop, stopId, user) {
  const ids = badgesByStop[stopId]?.[user] || [];
  return ids.map((id) => getBadge(id)?.emoji || '').join('');
}
