// Dashboard script, kept out of dashboard.html so its CSP can forbid inline script.
(() => {
  const REPO = 'dannbleeker/md-studio';
  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat('en');
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
    );
  // Escaping keeps a link inside its attribute, not its scheme: only
  // GitHub's own pages may be linked from API data.
  const ghUrl = (u) => (/^https:\/\/github\.com\//.test(String(u)) ? esc(u) : '#');

  const stat = (num, label) =>
    `<div class="card"><div class="num">${esc(num)}</div><div class="lbl">${esc(label)}</div></div>`;

  async function json(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }

  /** A small line chart as inline SVG (no chart library). */
  function sparkline(values, title, format) {
    const pts = values.filter((v) => typeof v === 'number');
    if (pts.length < 2)
      return `<div class="card"><div class="lbl">${esc(title)}</div><p class="muted note">Builds up as CI runs.</p></div>`;
    const min = Math.min(...pts),
      max = Math.max(...pts),
      span = max - min || 1;
    const step = 100 / (pts.length - 1);
    const d = pts
      .map(
        (v, i) =>
          `${i ? 'L' : 'M'}${(i * step).toFixed(2)},${(38 - ((v - min) / span) * 34).toFixed(2)}`
      )
      .join(' ');
    return `<div class="card"><div class="lbl">${esc(title)}</div><div class="num">${esc(format(pts.at(-1)))}</div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="${esc(title)} trend">
      <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg></div>`;
  }

  async function loadStats() {
    try {
      const [s, history] = await Promise.all([
        json('stats.json'),
        json('stats-history.json').catch(() => []),
      ]);
      $('generated').textContent = `Stats from ${s.generatedAt} · v${s.version}`;
      const app = s.code.find((c) => c.category === 'App code');
      $('headline').innerHTML = [
        stat(fmt.format(app?.lines ?? 0), 'lines of app code'),
        stat(
          s.tests ? fmt.format(s.tests.total) : '—',
          `unit tests${s.tests?.failed ? ` (${s.tests.failed} failing)` : ''}`
        ),
        stat(s.tests ? s.tests.e2eSpecs : '—', 'end-to-end spec files'),
        stat(s.coverage ? `${s.coverage.lines.toFixed(0)}%` : '—', 'line coverage'),
        stat(s.bundle ? kb(s.bundle.eagerGzipBytes) : '—', 'start-up download (gzip)'),
        stat(`${s.book.written}/${s.book.chapters}`, 'book chapters written'),
        stat(s.git ? fmt.format(s.git.commits) : '—', `commits since ${s.git?.firstCommit ?? '…'}`),
      ].join('');
      const most = Math.max(...s.code.map((c) => c.lines), 1);
      $('code').querySelector('tbody').innerHTML = s.code
        .map(
          (c) =>
            `<tr><td>${esc(c.category)}</td><td class="r">${fmt.format(c.files)}</td><td class="r">${fmt.format(c.lines)}</td>
         <td style="width:40%"><div class="bar" style="width:${(c.lines / most) * 100}%"></div></td></tr>`
        )
        .join('');
      if (s.bundle) {
        // Older stats.json files have no `eager` list; treat every chunk as eager then.
        const eager = new Set(s.bundle.eager ?? Object.keys(s.bundle.chunks));
        const chunks = Object.entries(s.bundle.chunks).sort(
          (a, b) => eager.has(b[0]) - eager.has(a[0]) || b[1] - a[1]
        );
        const top = Math.max(...chunks.map((c) => c[1]), 1);
        const row = ([name, size]) => {
          const lazy = !eager.has(name);
          return `<tr${lazy ? ' class="muted"' : ''}><td>${esc(name)}${lazy ? ' (on demand)' : ''}</td><td class="r">${kb(size)}</td>
            <td style="width:40%"><div class="bar" style="width:${(size / top) * 100}%${lazy ? ';opacity:.35' : ''}"></div></td></tr>`;
        };
        $('bundle').querySelector('tbody').innerHTML =
          chunks.map(row).join('') +
          `<tr class="muted"><td>Code languages (on demand)</td><td class="r">${kb(s.bundle.lazyLanguageGzipBytes)}</td><td></td></tr>`;
      }
      $('trends').innerHTML = [
        sparkline(
          history.map((h) => h.appLines),
          'App code lines',
          (v) => fmt.format(v)
        ),
        sparkline(
          history.map((h) => h.tests),
          'Unit tests',
          (v) => fmt.format(v)
        ),
        sparkline(
          history.map((h) => h.coverageLines),
          'Line coverage',
          (v) => `${v.toFixed(0)}%`
        ),
        sparkline(
          history.map((h) => h.eagerGzipBytes),
          'Start-up download',
          kb
        ),
        sparkline(
          history.map((h) => h.bookWords),
          'Book words',
          (v) => fmt.format(v)
        ),
      ].join('');
    } catch {
      $('generated').textContent =
        'stats.json not available yet (the Stats workflow writes it on push to main).';
    }
  }

  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    return m < 60
      ? `${m} min ago`
      : m < 2880
        ? `${Math.round(m / 60)} h ago`
        : `${Math.round(m / 1440)} d ago`;
  };

  async function loadGitHub() {
    try {
      const runs = await json(`https://api.github.com/repos/${REPO}/actions/runs?per_page=30`);
      const latest = new Map();
      for (const r of runs.workflow_runs) if (!latest.has(r.name)) latest.set(r.name, r);
      $('runs').innerHTML =
        [...latest.values()]
          .map((r) => {
            const state =
              r.status !== 'completed'
                ? ['run', 'running']
                : r.conclusion === 'success'
                  ? ['ok', 'passed']
                  : r.conclusion === 'skipped' || r.conclusion === 'cancelled'
                    ? ['muted', r.conclusion]
                    : ['fail', r.conclusion];
            return `<li><span class="${state[0]}">●</span><a class="ellipsis" href="${ghUrl(r.html_url)}">${esc(r.name)}</a><span class="muted">${esc(state[1])} · ${ago(r.updated_at)}</span></li>`;
          })
          .join('') || '<li class="muted">No runs yet.</li>';
      const commits = await json(`https://api.github.com/repos/${REPO}/commits?per_page=8`);
      $('commits').innerHTML = commits
        .map(
          (c) =>
            `<li><a class="sha" href="${ghUrl(c.html_url)}">${esc(c.sha.slice(0, 7))}</a><span class="ellipsis">${esc(c.commit.message.split('\n')[0])}</span><span class="muted">${ago(c.commit.author.date)}</span></li>`
        )
        .join('');
    } catch {
      for (const id of ['runs', 'commits']) {
        if ($(id).textContent.trim() === 'Loading…')
          $(id).innerHTML = '<li class="muted">Unavailable.</li>';
      }
      $('gh-note').textContent =
        'GitHub data unavailable right now (offline, or the API rate limit for anonymous requests was reached).';
    }
  }

  loadStats();
  loadGitHub();
})();
