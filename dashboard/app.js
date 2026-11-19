// Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, the filters, a per-protocol detail view with the model's breakdown
// and the protocol's farm plan, and the live-token set kept apart. No network: every byte it
// shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchlistOnly: false, preTokenOnly: true, sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 10000) / 10000).toFixed(2) + 'x'; }

  // The model, recomputed in the page from the row's own raw figures and the shipped
  // constants — the same arithmetic as lib/model.ts, unrounded — so the page checks the number
  // board.json carries, and the page's code and the board's data are visibly the same model.
  // implied = tvl_component x growth x maturity x chain.
  function impliedOf(row) {
    var m = DATA.model;
    var growthPct = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growthPct / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturityMult = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var chainCount = Math.max(0, Math.min((row.chains || []).length - 1, m.chain_max));
    var chainMult = 1 + chainCount * m.chain_step;
    return Math.max(1, Math.round(row.tvl_component_usd * growthMult * maturityMult * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- Farm plan: the same derivation main.ts writes to board.json. Category, chains, TVL
  // and age decide the action, the capital, the hold and every cost and time. No name is
  // special-cased, and no step claims a token is confirmed.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function playFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var borrow = Math.max(10, Math.round(capital / 5));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return {
      main: 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and borrow $' + borrow + ' of stablecoins against it.',
      second: 'Repay the $' + borrow + ' loan within a week and borrow again, so the wallet shows two-sided activity.',
      risk: 'A loan against a supply can be liquidated if the collateral falls, so keep the loan below half the supply\u2019s value.'
    };
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return {
      main: 'Provide $' + capital + ' of liquidity to ' + name + '\u2019s largest pool on ' + chain + ' in the USDC pair and keep the LP position open.',
      second: 'Swap $25 of USDC for the chain\u2019s native asset through ' + name + ' once a week.',
      risk: 'Liquidity positions lose value to impermanent loss when prices move, and the pair\u2019s fees have to cover it.'
    };
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return {
      main: 'Deposit $' + capital + ' of USDC into ' + name + '\u2019s highest-yield vault on ' + chain + ' and leave the shares staked.',
      second: 'Claim the vault\u2019s yield once a week and restake it instead of letting it sit.',
      risk: 'Vault yields fall when the underlying strategy\u2019s returns fall; the advertised rate is not a promise.'
    };
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return {
      main: 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open a small hedged position of $' + (capital * 2) + ' notional.',
      second: 'Close and reopen the hedge once so the account shows two settled trades.',
      risk: 'Leveraged positions can be liquidated in a fast move, so keep the position small and the margin above the minimum.'
    };
    if (c.indexOf('rwa') >= 0) return {
      main: 'Mint $' + capital + ' of ' + name + '\u2019s yield-bearing asset on ' + chain + ' and hold it in the farming wallet.',
      second: 'Reinvest the first yield payout into the same asset instead of withdrawing it.',
      risk: 'A yield asset backed by off-chain assets depends on its issuer\u2019s reserves and reporting, so read the attestation first.'
    };
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return {
      main: 'Deposit $' + capital + ' of USDC into a ' + name + ' curated vault on ' + chain + ' and keep the vault shares.',
      second: 'Move $25 into a second vault from the same curator to show breadth across its allocations.',
      risk: 'A curated vault follows the curator\u2019s choices, and a bad allocation is the farmer\u2019s loss.'
    };
    if (c.indexOf('bridge') >= 0) return {
      main: 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ', then use the bridged funds inside the destination app.',
      second: 'Bridge $25 back the other way once, so the route is used in both directions.',
      risk: 'Bridges are a common exploit target, so bridge only what the farm needs and move funds out afterwards.'
    };
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return {
      main: 'Stake $' + capital + ' of the chain\u2019s native asset through ' + name + ' on ' + chain + ' and hold the liquid receipt token.',
      second: 'Restake the receipt token\u2019s rewards once a month instead of selling them.',
      risk: 'Staking locks the asset and the receipt token can trade below its peg, and unstaking can take days.'
    };
    if (c.indexOf('basis') >= 0) return {
      main: 'Deposit $' + capital + ' of USDC into ' + name + '\u2019s basis vault on ' + chain + ' and keep the position through one funding cycle.',
      second: 'Add $25 after the first funding cycle settles, so the position grows with the strategy.',
      risk: 'Basis trades lose money when funding stays negative for a long stretch.'
    };
    if (c.indexOf('insurance') >= 0) return {
      main: 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' for a protocol you already use, and keep the policy active.',
      second: 'Renew or top up the cover once before it expires, so the wallet shows a second policy.',
      risk: 'Cover pays only for the perils the policy names, so read the exclusions before buying.'
    };
    if (c.indexOf('payment') >= 0) return {
      main: 'Fund a ' + name + ' account with $' + capital + ' of USDC on ' + chain + ' and make one payment through it.',
      second: 'Pay a second invoice or subscription through ' + name + ' in the same month.',
      risk: 'A payment app\u2019s points depend on its own program, which it can change without notice.'
    };
    if (c.indexOf('chain') >= 0) return {
      main: 'Bridge $' + capital + ' of USDC onto ' + chain + ' and use it in two of the chain\u2019s largest apps, starting with ' + name + '.',
      second: 'Interact with a second app on ' + chain + ' in the same week, so the wallet is active on the chain.',
      risk: 'A new chain\u2019s apps can halt or migrate, so keep the position small until the chain proves itself.'
    };
    if (c.indexOf('stablecoin') >= 0) return {
      main: 'Wrap $' + capital + ' of USDC into ' + name + '\u2019s stable asset on ' + chain + ' and hold it.',
      second: 'Use the wrapped asset in one lending market on ' + chain + '.',
      risk: 'A wrapped stablecoin can depeg from the asset it tracks, so check its reserves and redemption path.'
    };
    if (c.indexOf('prediction') >= 0) return {
      main: 'Fund $' + capital + ' on ' + name + ' and place one small position in a market that settles within the month.',
      second: 'Settle that position and open a second one in a different market.',
      risk: 'Prediction markets are zero-sum, and most positions lose their stake.'
    };
    return {
      main: 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.',
      second: 'Make one extra deposit of $25 in the second week, so the wallet shows repeated activity.',
      risk: 'Smart-contract risk applies to every position, so never farm with funds you cannot afford to lose.'
    };
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var play = playFor(p, capital, chain);
    var secondChain = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var fourth = secondChain !== null
      ? { text: 'Repeat a $25 position on ' + secondChain + ' so the activity spans two chains.', cost: '$25 of capital and about $3 of gas', time: '15 minutes' }
      : { text: 'Open a second $25 position in another pool of ' + p.name + ' on ' + chain + ' to show breadth.', cost: '$25 of capital and about $3 of gas', time: '15 minutes' };
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: play.main, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: play.second, cost: 'about $3 of gas', time: '10 minutes' },
      fourth,
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the main position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Know the risk before you scale up: ' + play.risk, cost: 'nothing to read, and it can save the position', time: '10 minutes' },
      { text: 'Before you withdraw, open ' + p.name + '\u2019s own points or rewards page from the link the protocol itself publishes and check what the wallet earned. Never pay to claim.', cost: 'no fee to check', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, then unwind in two tranches a week apart so a late snapshot still catches the position.', cost: 'nothing but the log', time: '5 minutes to log, a week to unwind' }
    ].map(stepText);
  }

  // ---- Hash deep links: #q=, #category=, #chain=, #minTvl=, #watchlist=1, #preToken=0, #p=slug.
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('preToken') === '0') state.preTokenOnly = false;
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (!state.preTokenOnly) params.set('preToken', '0');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Launch Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, ranked by the same model. Implied value is a model, not a promise — and a protocol that records no token may still have one.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function optionList(values, current, allLabel) {
    var opts = [el('option', { value: 'all', text: allLabel })];
    values.forEach(function (v) { opts.push(el('option', { value: v, text: v, selected: v === current ? 'selected' : null })); });
    return opts;
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' }, optionList(categories, state.category, 'All categories'));
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' }, optionList(chains, state.chain, 'All chains'));
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var tvl = el('select', { id: 'minTvl', 'aria-label': 'Minimum TVL' },
      [0, 1e7, 5e7, 1e8, 5e8, 1e9].map(function (v) {
        return el('option', { value: String(v), text: v === 0 ? 'Any TVL' : 'TVL at least ' + fmtUsd(v), selected: v === state.minTvl ? 'selected' : null });
      })
    );
    tvl.addEventListener('change', function () { state.minTvl = Number(tvl.value) || 0; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlistOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; writeHash(); render(); });
    var pt = el('input', { type: 'checkbox', id: 'preToken', checked: state.preTokenOnly ? 'checked' : null });
    pt.addEventListener('change', function () { state.preTokenOnly = pt.checked; writeHash(); render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Minimum TVL' }), tvl),
      el('label', { class: 'check', for: 'watchlist' }, wl, 'Watchlist only'),
      el('label', { class: 'check', for: 'preToken' }, pt, 'Pre-token only'),
      el('span', { class: 'count', text: filteredRows().length + ' rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or loosen a filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), r.watchlist ? el('span', { class: 'tag', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'records no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Live tokens, by market cap: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + min(chains - 1, ' + m.chain_max + ') x ' + m.chain_step + ') )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. The category multiple is what share of TVL a launch is worth for that kind of protocol. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Growth is clamped so one wild week cannot decide the board. The early radar is every rankable pre-token protocol below the watchlist floor, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? '  \u00b7  Watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Protocol record' }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day change' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'First listed' }), el('b', { class: 'num', text: row.listed_at || 'unknown' })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Token status' }), el('b', { class: 'num', text: 'records no token' }))
      ),
      el('p', { class: 'note', text: 'The snapshot records no token for this protocol. That is a record, not proof: a token may exist that the record does not carry.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — how it was computed' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL x category multiple (' + fmtMult(row.category_multiple) + ')' }), el('b', { class: 'num', text: fmtUsd(row.tvl_component_usd) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: fmtMult(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: fmtMult(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: fmtMult(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(boardTable());
    if (!state.preTokenOnly) shell.appendChild(liveTable());
    shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
