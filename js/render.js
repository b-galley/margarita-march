// DOM rendering for stops + leaderboard. Follows the same "rebuild the subtree, then
// re-wire listeners" pattern as the old app — no framework, no diffing — but event
// wiring here calls back into caller-supplied handlers instead of touching global state
// directly, so main.js stays the single owner of app state.

import { BADGES, getBadgeEmojisForStop } from './badges.js';
import { CATEGORIES } from './categories.js';
import { getUserComposite, getAggregatedScores, getRanked, getLeaderId } from './scoring.js';

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const AVATAR_COLORS = ['#F4A623', '#8BC53F', '#FF6B5B', '#5C8A24', '#C97F0F'];
function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatarChip(name, opts = {}) {
  const { size = 30, fontSize = '0.7rem', dimmed = false, subtitle = null } = opts;
  const initial = name.trim()[0]?.toUpperCase() || '?';
  const title = subtitle ? `${name} — ${subtitle}` : name;
  return `<span class="avatar-chip" title="${escapeHtml(title)}" style="
    background:${colorForName(name)};width:${size}px;height:${size}px;font-size:${fontSize};
    opacity:${dimmed ? 0.4 : 1};
  ">${escapeHtml(initial)}</span>`;
}

export function avatarRow(names, opts = {}) {
  return `<span class="avatar-row">${names.map((n) => avatarChip(n, opts)).join('')}</span>`;
}

// ctx: { stops, allRatings, allUsers, myLocalScores, mySubmittedStops, userName, expandedStopId, badgesByStop, photoMeta }
export function renderStops(container, ctx, handlers) {
  const { stops, allRatings, allUsers, myLocalScores, mySubmittedStops, userName, expandedStopId, badgesByStop = {}, photoMeta = {} } = ctx;
  const leaderId = getLeaderId(stops, allRatings);
  const aggregated = getAggregatedScores(stops, allRatings);

  container.innerHTML = stops
    .map((stop, idx) => {
      const localScores = myLocalScores[stop.id] || {};
      const myComposite = getUserComposite(localScores);
      const agg = aggregated.find((s) => s.id === stop.id);
      const raterCount = agg ? agg.raterCount : 0;
      const displayScore = raterCount > 0 ? agg.composite.toFixed(1) : myComposite.toFixed(1);
      const pillLabel = raterCount > 0 ? 'AVG' : 'YOURS';
      const isSubmitted = !!mySubmittedStops[stop.id];
      const isExpanded = stop.id === expandedStopId;

      return `
      <div class="stop-card${isExpanded ? ' expanded' : ''}${stop.id === leaderId ? ' is-leader' : ''}" data-stop-id="${stop.id}">
        <div class="stop-header" data-action="toggle" data-id="${stop.id}">
          <div class="stop-number">${idx + 1}</div>
          <div class="stop-name-block">
            <div class="stop-name">${escapeHtml(stop.name)}</div>
            <div class="stop-address">${escapeHtml(stop.address)}</div>
          </div>
          <div class="stop-score-pill">
            <small>${pillLabel}</small>
            <span class="pill-score">${displayScore}</span>
          </div>
        </div>
        <div class="stop-body">
          <p class="stop-description">${escapeHtml(stop.desc)}</p>
          <div class="photo-section">
            <div class="photo-section-label">Photos</div>
            <div class="photo-grid">
              ${Object.entries(photoMeta[stop.id] || {}).map(([user, photo]) => `
                <div class="photo-thumb-wrap">
                  <img class="photo-thumb" src="${photo.dataUrl}" alt="Photo by ${escapeHtml(user)}">
                  <span class="photo-thumb-user">${escapeHtml(user)}</span>
                  ${user === userName ? `<button class="photo-delete-btn" data-remove-photo-stop="${stop.id}" data-remove-photo-user="${escapeHtml(user)}" aria-label="Delete photo" title="Delete photo">×</button>` : ''}
                </div>
              `).join('')}
              <label class="photo-upload-tile">
                <span class="photo-upload-icon">📷</span>
                <span class="photo-upload-text">Add Photo</span>
                <input type="file" accept="image/*" capture="environment" data-photo-stop="${stop.id}">
              </label>
            </div>
          </div>
          <div class="score-grid">
            ${CATEGORIES.map((cat) => `
              <div class="score-row ${cat.key === 'wildcard' ? 'wildcard-row' : ''}">
                <div>
                  <div class="score-label">${cat.label}</div>
                  <div class="score-sublabel">${cat.sublabel}</div>
                </div>
                <div class="score-value" id="val-${stop.id}-${cat.key}">${localScores[cat.key] ?? 7}</div>
                <input class="score-slider${(localScores[cat.key] ?? 7) < 5 ? ' low-score' : ''}" type="range" min="1" max="10" step="1"
                       value="${localScores[cat.key] ?? 7}"
                       data-stop="${stop.id}" data-cat="${cat.key}"
                       aria-label="${cat.label}">
              </div>
            `).join('')}
          </div>
          <button class="submit-ratings-btn ${isSubmitted ? 'submitted' : 'not-submitted'}" data-submit-stop="${stop.id}">
            ${isSubmitted ? '✓ Ratings Submitted — Tap to Update' : 'Submit My Ratings'}
          </button>
          <div class="submission-avatars">
            <span class="submission-label">Rated:</span>
            ${Object.keys(allUsers).map((u) => {
              const hasRated = !!(allRatings[u] && allRatings[u][stop.id]);
              const userComp = hasRated ? getUserComposite(allRatings[u][stop.id]).toFixed(1) : null;
              const badgeEmojis = hasRated ? getBadgeEmojisForStop(badgesByStop, stop.id, u) : '';
              const chip = avatarChip(u, { size: 26, fontSize: '0.6rem', dimmed: !hasRated, subtitle: hasRated ? userComp : 'not yet' });
              return badgeEmojis
                ? `<span class="avatar-with-badges">${chip}<span class="avatar-badge-flair" title="${escapeHtml(badgeEmojis)} earned here">${badgeEmojis}</span></span>`
                : chip;
            }).join('')}
          </div>
          <div class="notes-section">
            <div class="notes-label">Tasting Notes</div>
            <textarea class="notes-input" data-notes-id="${stop.id}" placeholder="Notes, quotes, hot takes...">${escapeHtml(ctx.notes?.[stop.id] || '')}</textarea>
          </div>
          <div class="stop-actions">
            <div class="nav-btns">
              <button class="btn" data-nav="prev" data-id="${stop.id}">← Prev</button>
              <button class="btn" data-nav="next" data-id="${stop.id}">Next →</button>
            </div>
            <div style="display:flex;gap:0.4rem;">
              <button class="btn" data-move="up" data-id="${stop.id}" ${idx === 0 ? 'disabled' : ''}>▲</button>
              <button class="btn" data-move="down" data-id="${stop.id}" ${idx === stops.length - 1 ? 'disabled' : ''}>▼</button>
              <button class="btn btn-jet" data-edit="${stop.id}">Edit</button>
              <button class="btn btn-danger" data-remove="${stop.id}">Remove</button>
            </div>
          </div>
        </div>
      </div>`;
    })
    .join('');

  attachStopEvents(container, handlers);
}

function attachStopEvents(container, handlers) {
  container.querySelectorAll('.stop-header').forEach((h) => {
    h.addEventListener('click', () => handlers.onToggle(h.dataset.id));
  });

  container.querySelectorAll('.score-slider').forEach((sl) => {
    sl.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseInt(sl.value, 10);
      sl.classList.toggle('low-score', val < 5);
      handlers.onSliderInput(sl.dataset.stop, sl.dataset.cat, val);
    });
  });

  container.querySelectorAll('[data-photo-stop]').forEach((input) => {
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (file) handlers.onPhotoSelected(input.dataset.photoStop, file);
    });
  });

  container.querySelectorAll('[data-remove-photo-stop]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onRemovePhoto(btn.dataset.removePhotoStop, btn.dataset.removePhotoUser);
    });
  });

  container.querySelectorAll('.submit-ratings-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onSubmit(btn.dataset.submitStop);
    });
  });

  container.querySelectorAll('[data-notes-id]').forEach((t) => {
    t.addEventListener('input', () => handlers.onNotesInput(t.dataset.notesId, t.value));
  });

  container.querySelectorAll('[data-nav]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onNav(b.dataset.id, b.dataset.nav);
    });
  });

  container.querySelectorAll('[data-move]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onMove(b.dataset.id, b.dataset.move);
    });
  });

  container.querySelectorAll('[data-edit]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onEdit(b.dataset.edit);
    });
  });

  container.querySelectorAll('[data-remove]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onRemove(b.dataset.remove);
    });
  });
}

export function renderLeaderboard(container, stops, allRatings) {
  const ranked = getRanked(stops, allRatings);
  if (!ranked.length || ranked[0].composite === 0) {
    container.innerHTML = '<div style="padding:1rem; font-style:italic; text-align:center; color:var(--salt); opacity:0.7;">No ratings yet — submit yours!</div>';
    return;
  }

  container.innerHTML = ranked
    .map((s, i) => {
      const breakdown = Object.keys(allRatings)
        .filter((u) => allRatings[u]?.[s.id])
        .map((u) => ({ name: u, composite: getUserComposite(allRatings[u][s.id]) }))
        .sort((a, b) => b.composite - a.composite);

      const breakdownHtml = breakdown
        .map((ub) => `
          <div class="leader-detail-row">
            ${avatarChip(ub.name, { size: 18, fontSize: '0.5rem' })}
            <span class="leader-detail-name">${escapeHtml(ub.name)}</span>
            <span class="leader-detail-score">${ub.composite.toFixed(1)}</span>
          </div>`)
        .join('');

      return `
      <div class="leader-row rank-${i + 1}" data-leader-stop="${s.id}">
        <div class="leader-rank">${i + 1}</div>
        <div class="leader-name">${escapeHtml(s.name)}</div>
        <div class="leader-score">${s.composite.toFixed(1)}</div>
        <div class="leader-detail">${breakdownHtml}</div>
      </div>`;
    })
    .join('');

  container.querySelectorAll('.leader-row').forEach((row) => {
    row.addEventListener('click', () => row.classList.toggle('expanded'));
  });
}

// badgesByUser: {userName: [badgeId, ...]}. Renders every badge — earned ones lit up
// with who earned them, unearned ones greyed out so there's something to chase.
export function renderBadgeGallery(container, badgesByUser) {
  container.innerHTML = `
    <div class="badge-gallery-title">🏆 Titles &amp; Badges</div>
    <div class="badge-grid">
      ${BADGES.map((badge) => {
        const earners = Object.keys(badgesByUser).filter((u) => badgesByUser[u]?.includes(badge.id));
        const earned = earners.length > 0;
        return `
        <div class="badge-card${earned ? ' earned' : ' locked'}" data-badge-id="${badge.id}">
          <div class="badge-card-emoji">${badge.emoji}</div>
          <div class="badge-card-title">${escapeHtml(badge.title)}</div>
          <div class="badge-card-detail">
            <div class="badge-card-desc">${escapeHtml(badge.desc)}</div>
            ${earned
              ? `<div class="badge-card-earners">${earners.map((u) => avatarChip(u, { size: 20, fontSize: '0.55rem' })).join('')}</div>`
              : '<div class="badge-card-earners badge-card-unearned">Nobody yet</div>'}
          </div>
        </div>`;
      }).join('')}
    </div>`;

  container.querySelectorAll('.badge-card').forEach((card) => {
    card.addEventListener('click', () => card.classList.toggle('open'));
  });
}

export function updateStickyLeader(stops, allRatings) {
  const ranked = getRanked(stops, allRatings);
  const nameEl = document.getElementById('stickyLeaderName');
  const scoreEl = document.getElementById('stickyLeaderScore');
  if (!ranked.length || ranked[0].composite === 0) {
    nameEl.textContent = '—';
    scoreEl.textContent = '—';
    return;
  }
  nameEl.textContent = ranked[0].name;
  scoreEl.textContent = ranked[0].composite.toFixed(1);
}
