/* Element Island — pure game logic (no DOM). Works in browser and Node. */
(function (global) {
  'use strict';

  var DATA =
    (typeof window !== 'undefined' && window.ELEMENT_ISLAND_DATA) ||
    (typeof require !== 'undefined' ? require('./game-data.js') : null);

  var ELEMENTS = DATA.elements;
  var ENAMES = DATA.elementNames;
  var ECOLORS = DATA.elementColors;
  var PROB = {};
  Object.keys(DATA.prob).forEach(function (k) { PROB[+k] = DATA.prob[k]; });

  var RECIPE = {};
  DATA.recipes.forEach(function (r) { RECIPE[r.id] = r; });
  DATA.expansionRecipes.forEach(function (r) { RECIPE[r.id] = r; });
  var GOAL = {};
  DATA.goals.forEach(function (g) { GOAL[g.id] = g; });
  DATA.expansionGoals.forEach(function (g) { GOAL[g.id] = g; });
  DATA.branchGoals.forEach(function (g) { GOAL[g.id] = g; });

  var COLOR_HEX = { P0: '#0F6E6E', P1: '#D97706', P2: '#7C3AED', P3: '#B91C1C' };

  /* ---------------------------------------------------------------- geometry */
  var SQ3 = Math.sqrt(3);
  var _geo = null;

  function key(x, y) {
    return x.toFixed(4) + ',' + y.toFixed(4);
  }

  function buildGeo() {
    if (_geo) return _geo;
    var hexes = DATA.board.map(function (b, i) {
      return { i: i, e: b.e, n: b.n, q: b.q, r: b.r, cx: SQ3 * (b.q + b.r / 2), cy: 1.5 * b.r };
    });
    var verts = {};
    var edges = {};
    hexes.forEach(function (h) {
      var cs = [];
      for (var k = 0; k < 6; k++) {
        var a = ((60 * k + 30) * Math.PI) / 180;
        cs.push({ x: h.cx + Math.cos(a), y: h.cy + Math.sin(a) });
      }
      h.corners = cs.map(function (c) { return key(c.x, c.y); });
      for (var k2 = 0; k2 < 6; k2++) {
        var kk = h.corners[k2];
        if (!verts[kk]) {
          verts[kk] = { key: kk, x: cs[k2].x, y: cs[k2].y, hexes: [], edges: [], adj: [] };
        }
        verts[kk].hexes.push(h.i);
        var kn = h.corners[(k2 + 1) % 6];
        var ek = kk < kn ? kk + '|' + kn : kn + '|' + kk;
        if (!edges[ek]) edges[ek] = { key: ek, a: kk, b: kn, hexes: [], mx: 0, my: 0 };
        if (edges[ek].hexes.indexOf(h.i) < 0) edges[ek].hexes.push(h.i);
      }
    });
    Object.keys(edges).forEach(function (ek) {
      var e = edges[ek];
      var va = verts[e.a], vb = verts[e.b];
      e.mx = (va.x + vb.x) / 2;
      e.my = (va.y + vb.y) / 2;
      va.edges.push(ek);
      vb.edges.push(ek);
      if (va.adj.indexOf(e.b) < 0) va.adj.push(e.b);
      if (vb.adj.indexOf(e.a) < 0) vb.adj.push(e.a);
    });

    // ports: pick 6 edges on the convex hull so they always face outward
    var vlist = Object.keys(verts).map(function (k) { return verts[k]; });
    vlist.sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    var lower = [];
    vlist.forEach(function (p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    });
    var upper = [];
    for (var vi = vlist.length - 1; vi >= 0; vi--) {
      var pv = vlist[vi];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pv) <= 0) upper.pop();
      upper.push(pv);
    }
    lower.pop(); upper.pop();
    var hull = lower.concat(upper);
    var hullEdges = [];
    for (var hi = 0; hi < hull.length; hi++) {
      var a1 = hull[hi].key, b1 = hull[(hi + 1) % hull.length].key;
      var k1 = a1 < b1 ? a1 + '|' + b1 : b1 + '|' + a1;
      if (edges[k1]) hullEdges.push(edges[k1]);
    }
    var cx0 = 0, cy0 = 0;
    hull.forEach(function (v) { cx0 += v.x; cy0 += v.y; });
    cx0 /= hull.length; cy0 /= hull.length;
    hullEdges.forEach(function (e) { e.ang = Math.atan2(e.my - cy0, e.mx - cx0); });
    hullEdges.sort(function (a, b) { return a.ang - b.ang; });
    var portTypes = [
      { type: '3:1', label: '3:1 通用', elem: null },
      { type: '2:1', label: '2:1 H/O', elem: 'HO' },
      { type: '3:1', label: '3:1 通用', elem: null },
      { type: '2:1', label: '2:1 C', elem: 'C' },
      { type: '2:1', label: '2:1 Na/Cl', elem: 'NaCl' },
      { type: '2:1', label: '2:1 Fe', elem: 'Fe' }
    ];
    var ports = [];
    var step = hullEdges.length / portTypes.length;
    for (var pi = 0; pi < portTypes.length; pi++) {
      var e2 = hullEdges[Math.floor(pi * step) % hullEdges.length];
      ports.push({
        id: 'P' + (pi + 1),
        edge: e2.key,
        verts: [e2.a, e2.b],
        mx: e2.mx,
        my: e2.my,
        ang: e2.ang,
        type: portTypes[pi].type,
        label: portTypes[pi].label,
        elem: portTypes[pi].elem
      });
    }

    _geo = { hexes: hexes, vertices: verts, edges: edges, ports: ports };
    return _geo;
  }

  /* -------------------------------------------------------------- validation */
  function totalTokens(p) {
    var t = 0;
    ELEMENTS.forEach(function (e) { t += p.res[e] || 0; });
    return t;
  }

  function totalProducts(p) {
    var t = 0;
    Object.keys(p.prod).forEach(function (k) { t += p.prod[k]; });
    return t;
  }

  function goalAtoms(g) {
    var out = { H: 0, O: 0, C: 0, Na: 0, Cl: 0, Fe: 0 };
    g.reactants.forEach(function (r) {
      if (r[0] === 'token') out[r[1]] += r[2];
      else {
        var a = RECIPE[r[1]].atoms;
        Object.keys(a).forEach(function (e) { out[e] += a[e] * r[2]; });
      }
    });
    return out;
  }

  function goalPay(g) {
    return g.reactants.map(function (r) {
      return r[0] === 'token'
        ? { kind: 'token', el: r[1], n: r[2] }
        : { kind: 'card', rid: r[1], n: r[2] };
    });
  }

  function canPayGoal(p, g) {
    return goalPay(g).every(function (x) {
      return x.kind === 'token' ? (p.res[x.el] || 0) >= x.n : (p.prod[x.rid] || 0) >= x.n;
    });
  }

  function hasLab(state, idx) {
    return Object.keys(state.buildings).some(function (k) {
      return state.buildings[k].p === idx;
    });
  }

  function hasFactory(state, idx) {
    return Object.keys(state.buildings).some(function (k) {
      return state.buildings[k].p === idx && state.buildings[k].type === 'factory';
    });
  }

  function buildingAt(state, vkey) {
    return state.buildings[vkey] || null;
  }

  function pipeAt(state, ekey) {
    return state.pipes[ekey] === undefined ? null : state.pipes[ekey];
  }

  /* ------------------------------------------------------------------ state */
  function newGame(cfg) {
    cfg = cfg || {};
    var geo = buildGeo();
    var names = cfg.players || ['玩家 1', '玩家 2'];
    var players = names.map(function (nm, i) {
      var res = {};
      ELEMENTS.forEach(function (e) { res[e] = 0; });
      return {
        id: i,
        name: nm,
        color: cfg.colors ? cfg.colors[i] : COLOR_HEX['P' + i],
        res: res,
        prod: {},
        goals: [],
        env: 0,
        seq: i
      };
    });
    var n = players.length;
    var short = cfg.mode === 'short';
    var vpGoal = cfg.vpGoal || (short ? 6 : n === 2 ? 8 : 10);
    var rounds = n === 2 ? 3 : 2;

    var bank = {};
    ELEMENTS.forEach(function (e) { bank[e] = 40; });

    var state = {
      version: 1,
      mode: short ? 'short' : 'standard',
      vpGoal: vpGoal,
      n: n,
      players: players,
      bank: bank,
      buildings: {},
      pipes: {},
      polluted: null,
      goalDeck: [],
      market: [],
      phase: 'setup',
      setup: {
        rounds: rounds,
        round: 1,
        order: [],
        idx: 0,
        stage: 'lab',
        total: rounds * n
      },
      turn: { p: 0, dice: [0, 0], synth: 0, goalsDone: 0, bought: 0, played: 0, done: false },
      log: [],
      winner: null
    };

    // snake order lamps
    var order = [];
    for (var r = 0; r < rounds; r++) {
      var seq = [];
      for (var i = 0; i < n; i++) seq.push(i);
      if (r % 2 === 1) seq.reverse();
      order = order.concat(seq);
    }
    state.setup.order = order;

    var deck = DATA.goals.map(function (g) { return g.id; });
    state.goalDeck = shuffle(deck, cfg.rng);
    state.market = [];
    for (var m = 0; m < 3; m++) state.market.push(state.goalDeck.shift() || null);

    state.turn.p = 0;
    return state;
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    var rand = rng || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function log(state, msg, cls) {
    state.log.push({ t: Date.now(), msg: msg, cls: cls || '' });
    if (state.log.length > 400) state.log.shift();
  }

  /* -------------------------------------------------------------- placement */
  function setupPlayer(state) {
    return state.setup.order[state.setup.idx];
  }

  function setupRemaining(state) {
    return state.setup.total - state.setup.idx;
  }

  function touchingOwnNetwork(state, p, vertexKey) {
    var geo = buildGeo();
    var v = geo.vertices[vertexKey];
    if (!v) return false;
    var b = state.buildings[vertexKey];
    if (b && b.p === p) return true;
    return v.edges.some(function (ek) { return pipeAt(state, ek) === p; });
  }

  function hasAdjacentBuilding(state, vertexKey) {
    var geo = buildGeo();
    var v = geo.vertices[vertexKey];
    if (buildingAt(state, vertexKey)) return true;
    return v.adj.some(function (k) { return !!state.buildings[k]; });
  }

  function legalLabVertices(state, p, isSetup) {
    var geo = buildGeo();
    var out = [];
    Object.keys(geo.vertices).forEach(function (k) {
      if (state.buildings[k]) return;
      if (hasAdjacentBuilding(state, k)) return;
      if (!isSetup && !touchingOwnNetwork(state, p, k)) return;
      out.push(k);
    });
    return out;
  }

  function legalPipeEdges(state, p, isSetup, fromVertex) {
    var geo = buildGeo();
    var out = [];
    Object.keys(geo.edges).forEach(function (ek) {
      if (state.pipes[ek] !== undefined) return;
      if (isSetup) {
        var e = geo.edges[ek];
        if (fromVertex && e.a !== fromVertex && e.b !== fromVertex) return;
        out.push(ek);
        return;
      }
      if (
        touchingOwnNetwork(state, p, geo.edges[ek].a) ||
        touchingOwnNetwork(state, p, geo.edges[ek].b)
      ) {
        out.push(ek);
      }
    });
    return out;
  }

  function placeSetupLab(state, p, vertexKey) {
    if (state.phase !== 'setup') return { ok: false, error: '不在初始摆放阶段' };
    if (setupPlayer(state) !== p) return { ok: false, error: '还没轮到你摆放' };
    if (state.setup.stage !== 'lab') return { ok: false, error: '先放导管' };
    if (state.buildings[vertexKey]) return { ok: false, error: '这个交点已有建筑' };
    if (hasAdjacentBuilding(state, vertexKey)) return { ok: false, error: '实验室之间至少隔一个交点' };
    state.buildings[vertexKey] = { p: p, type: 'lab' };
    state.setup.stage = 'pipe';
    state.setup.lastLab = vertexKey;
    log(state, state.players[p].name + ' 放置了第 ' + state.setup.round + ' 座实验室', 'ok');

    // last round: collect starting resources from adjacent hexes
    if (state.setup.round === state.setup.rounds) {
      var geo = buildGeo();
      var hexes = geo.vertices[vertexKey].hexes;
      var got = [];
      hexes.forEach(function (hi) {
        var e = geo.hexes[hi].e;
        if (state.bank[e] > 0) {
          state.bank[e]--;
          state.players[p].res[e]++;
          got.push(e);
        }
      });
      if (got.length) log(state, '初始资源：' + got.join(' '), 'muted');
    }
    return { ok: true };
  }

  function placeSetupPipe(state, p, edgeKey) {
    if (state.phase !== 'setup') return { ok: false, error: '不在初始摆放阶段' };
    if (setupPlayer(state) !== p) return { ok: false, error: '还没轮到你摆放' };
    if (state.setup.stage !== 'pipe') return { ok: false, error: '先放实验室' };
    if (state.pipes[edgeKey] !== undefined) return { ok: false, error: '这条边已有导管' };
    var geo = buildGeo();
    var e = geo.edges[edgeKey];
    if (!e || (e.a !== state.setup.lastLab && e.b !== state.setup.lastLab)) {
      return { ok: false, error: '导管必须接在刚放的实验室上' };
    }
    state.pipes[edgeKey] = p;
    state.setup.stage = 'lab';
    log(state, state.players[p].name + ' 放置了 1 根导管', 'ok');
    advanceSetup(state);
    return { ok: true };
  }

  function advanceSetup(state) {
    state.setup.idx++;
    if (state.setup.idx >= state.setup.total) {
      state.phase = 'roll';
      state.turn.p = 0;
      log(state, '初始摆放完成，' + state.players[0].name + ' 先手', 'ok');
      return;
    }
    var n = state.n;
    var placed = state.setup.idx;
    state.setup.round = Math.floor(placed / n) + 1;
  }

  /* ------------------------------------------------------------------- turn */
  function currentPlayer(state) {
    return state.turn.p;
  }

  function roll(state, rng) {
    if (state.phase !== 'roll') return { ok: false, error: '现在不能掷骰' };
    var rand = rng || Math.random;
    var d1 = 1 + Math.floor(rand() * 6);
    var d2 = 1 + Math.floor(rand() * 6);
    state.turn.dice = [d1, d2];
    state.rollSeq = (state.rollSeq || 0) + 1;
    var sum = d1 + d2;
    state.turn.synth = 0;
    state.turn.goalsDone = 0;
    state.turn.bought = 0;
    state.turn.played = 0;
    log(state, state.players[state.turn.p].name + ' 掷出 ' + d1 + '+' + d2 + ' = ' + sum, 'dice');
    if (sum === 7) {
      applyDiscard(state);
      state.phase = 'pollution-place';
      return { ok: true, sum: sum, seven: true };
    }
    produce(state, sum);
    state.phase = 'action';
    return { ok: true, sum: sum, seven: false };
  }

  function produce(state, sum) {
    var geo = buildGeo();
    var gained = {};
    ELEMENTS.forEach(function (e) { gained[e] = 0; });
    geo.hexes.forEach(function (h) {
      if (h.n !== sum) return;
      if (state.polluted === h.i) return;
      h.corners.forEach(function (vk) {
        var b = state.buildings[vk];
        if (!b) return;
        var amt = b.type === 'factory' ? 2 : 1;
        for (var i = 0; i < amt; i++) {
          if (state.bank[h.e] <= 0) break;
          state.bank[h.e]--;
          state.players[b.p].res[h.e]++;
          gained[h.e]++;
        }
      });
    });
    var txt = ELEMENTS.filter(function (e) { return gained[e] > 0; })
      .map(function (e) { return gained[e] + e; })
      .join(' ');
    if (txt) log(state, '产出：' + txt, 'muted');
    else log(state, '这轮没有产出', 'muted');
  }

  function applyDiscard(state) {
    state.players.forEach(function (pl) {
      var t = totalTokens(pl);
      if (t > 7) {
        var drop = Math.floor(t / 2);
        var order = ELEMENTS.slice().sort(function (a, b) { return pl.res[b] - pl.res[a]; });
        var left = drop;
        order.forEach(function (e) {
          if (left <= 0) return;
          var take = Math.min(pl.res[e], left);
          pl.res[e] -= take;
          state.bank[e] += take;
          left -= take;
        });
        log(state, pl.name + ' 元素超过 7 个，弃掉 ' + drop + ' 个', 'warn');
      }
    });
  }

  function placePollution(state, hexIdx) {
    if (state.phase !== 'pollution-place') return { ok: false, error: '现在不处理污染' };
    if (hexIdx < 0 || hexIdx >= DATA.board.length) return { ok: false, error: '无效板块' };
    state.polluted = hexIdx;
    var e = DATA.board[hexIdx];
    log(state, '污染标记放在 ' + e.e + e.n + ' 板块', 'warn');
    var geo = buildGeo();
    var h = geo.hexes[hexIdx];
    var cands = [];
    h.corners.forEach(function (vk) {
      var b = state.buildings[vk];
      if (b && b.p !== state.turn.p && cands.indexOf(b.p) < 0) cands.push(b.p);
    });
    if (cands.length === 0) {
      state.phase = 'action';
      return { ok: true, stealCandidates: [] };
    }
    state.phase = 'pollution-steal';
    return { ok: true, stealCandidates: cands };
  }

  function steal(state, victimIdx) {
    if (state.phase !== 'pollution-steal') return { ok: false, error: '现在不能偷牌' };
    var p = state.turn.p;
    var victim = state.players[victimIdx];
    var pool = [];
    ELEMENTS.forEach(function (e) {
      for (var i = 0; i < (victim.res[e] || 0); i++) pool.push(e);
    });
    if (pool.length === 0) {
      log(state, victim.name + ' 没有元素可偷', 'muted');
    } else {
      var pick = pool[Math.floor(Math.random() * pool.length)];
      victim.res[pick]--;
      state.players[p].res[pick]++;
      log(state, state.players[p].name + ' 从 ' + victim.name + ' 抢走 1 ' + pick, 'warn');
    }
    state.phase = 'action';
    return { ok: true };
  }

  function skipSteal(state) {
    if (state.phase !== 'pollution-steal') return { ok: false, error: '现在不能跳过' };
    state.phase = 'action';
    return { ok: true };
  }

  /* ------------------------------------------------------------------ trades */
  function canAffordTokens(p, cost) {
    return Object.keys(cost).every(function (e) {
      if (e === 'any') return totalTokens(p) >= cost.any;
      return (p.res[e] || 0) >= cost[e];
    });
  }

  function payTokens(state, p, cost, anyPick) {
    var pl = state.players[p];
    var picks = anyPick || [];
    var pi = 0;
    Object.keys(cost).forEach(function (e) {
      if (e === 'any') {
        for (var i = 0; i < cost.any; i++) {
          var el = picks[pi++];
          pl.res[el]--;
          state.bank[el]++;
        }
      } else {
        pl.res[e] -= cost[e];
        state.bank[e] += cost[e];
      }
    });
  }

  function tradeBank(state, p, give, get) {
    if (state.phase !== 'action' || state.turn.p !== p) return { ok: false, error: '现在不能交易' };
    var pl = state.players[p];
    if ((pl.res[give] || 0) < 3) return { ok: false, error: '银行交易需要 3 个相同元素' };
    if (state.bank[get] <= 0) return { ok: false, error: '银行没有这种元素了' };
    pl.res[give] -= 3;
    state.bank[give] += 3;
    pl.res[get]++;
    state.bank[get]--;
    log(state, pl.name + ' 银行交易：3' + give + ' → 1' + get, 'trade');
    return { ok: true };
  }

  function portForPlayer(state, p, portId) {
    var port = null;
    buildGeo().ports.forEach(function (pt) { if (pt.id === portId) port = pt; });
    if (!port) return null;
    var owns = port.verts.some(function (v) {
      var b = state.buildings[v];
      return b && b.p === p;
    });
    return owns ? port : null;
  }

  function portAccepts(port, give) {
    if (port.type === '3:1') return true;
    return port.elem === 'HO' ? give === 'H' || give === 'O' : port.elem === 'NaCl' ? give === 'Na' || give === 'Cl' : port.elem === give;
  }

  function tradePort(state, p, portId, give, get) {
    if (state.phase !== 'action' || state.turn.p !== p) return { ok: false, error: '现在不能交易' };
    var port = portForPlayer(state, p, portId);
    if (!port) return { ok: false, error: '你没有这个港口' };
    if (!portAccepts(port, give)) return { ok: false, error: '这个港口不收这种元素' };
    var pl = state.players[p];
    if ((pl.res[give] || 0) < 2) return { ok: false, error: '港口交易需要 2 个元素' };
    if (state.bank[get] <= 0) return { ok: false, error: '银行没有这种元素了' };
    pl.res[give] -= 2;
    state.bank[give] += 2;
    pl.res[get]++;
    state.bank[get]--;
    log(state, pl.name + ' 港口交易（' + port.label + '）：2' + give + ' → 1' + get, 'trade');
    return { ok: true };
  }

  function tradePlayers(state, a, b, giveA, giveB, getA, getB) {
    if (state.phase !== 'action' || state.turn.p !== a) return { ok: false, error: '只有当前玩家能发起交易' };
    var A = state.players[a], B = state.players[b];
    var check = function (pl, cost) {
      return Object.keys(cost).every(function (k) {
        if (k.indexOf('R') === 0) return (pl.prod[k] || 0) >= cost[k];
        return (pl.res[k] || 0) >= cost[k];
      });
    };
    if (!check(A, giveA)) return { ok: false, error: '你付不出这些' };
    if (!check(B, giveB)) return { ok: false, error: '对方付不出这些' };
    var move = function (from, to, cost) {
      Object.keys(cost).forEach(function (k) {
        if (k.indexOf('R') === 0) {
          from.prod[k] -= cost[k];
          to.prod[k] = (to.prod[k] || 0) + cost[k];
        } else {
          from.res[k] -= cost[k];
          to.res[k] += cost[k];
        }
      });
    };
    move(A, B, giveA);
    move(B, A, giveB);
    log(state, A.name + ' 与 ' + B.name + ' 完成玩家交易', 'trade');
    return { ok: true };
  }

  /* --------------------------------------------------------------- building */
  function buildPipe(state, p, edgeKey, anyPick) {
    if (state.phase !== 'action' || state.turn.p !== p) return { ok: false, error: '现在不能建造' };
    if (state.pipes[edgeKey] !== undefined) return { ok: false, error: '这条边已有导管' };
    if (legalPipeEdges(state, p, false).indexOf(edgeKey) < 0) return { ok: false, error: '必须接在自己的网络上' };
    var pl = state.players[p];
    var needC = 1 + (anyPick === 'C' ? 1 : 0);
    if ((pl.res.C || 0) < needC || !anyPick || (pl.res[anyPick] || 0) < 1) {
      return { ok: false, error: '需要 1C＋1 任意元素（额外元素不能和 C 重复计数）' };
    }
    pl.res.C--; state.bank.C++;
    pl.res[anyPick]--; state.bank[anyPick]++;
    state.pipes[edgeKey] = p;
    log(state, pl.name + ' 建了 1 根导管', 'build');
    return { ok: true };
  }

  function buildLab(state, p, vertexKey) {
    if (state.phase !== 'action' || state.turn.p !== p) return { ok: false, error: '现在不能建造' };
    if (legalLabVertices(state, p, false).indexOf(vertexKey) < 0) {
      return { ok: false, error: '这里不能建实验室（需接网络且与其它实验室隔一个交点）' };
    }
    var pl = state.players[p];
    var cost = { H: 1, O: 1, C: 1, Na: 1 };
    if (!canAffordTokens(pl, cost)) return { ok: false, error: '实验室需要 1H＋1O＋1C＋1Na' };
    payTokens(state, p, cost);
    state.buildings[vertexKey] = { p: p, type: 'lab' };
    log(state, pl.name + ' 建了 1 座实验室（+1 分）', 'build');
    checkWin(state);
    return { ok: true, vp: true };
  }

  function buildFactory(state, p, vertexKey, productRid) {
    if (state.phase !== 'action' || state.turn.p !== p) return { ok: false, error: '现在不能建造' };
    var b = state.buildings[vertexKey];
    if (!b || b.p !== p || b.type !== 'lab') return { ok: false, error: '只能升级自己的实验室' };
    var pl = state.players[p];
    if ((pl.res.Fe || 0) < 2 || (pl.res.C || 0) < 1 || (pl.res.Cl || 0) < 1) {
      return { ok: false, error: '工厂需要 2Fe＋1C＋1Cl' };
    }
    if (!productRid || !(pl.prod[productRid] > 0)) return { ok: false, error: '还需要 1 张产物卡' };
    pl.res.Fe -= 2; state.bank.Fe += 2;
    pl.res.C--; state.bank.C++;
    pl.res.Cl--; state.bank.Cl++;
    pl.prod[productRid]--;
    if (pl.prod[productRid] === 0) delete pl.prod[productRid];
    state.buildings[vertexKey] = { p: p, type: 'factory' };
    log(state, pl.name + ' 把实验室升级为工厂（+2 分，产出 2）', 'build');
    checkWin(state);
    return { ok: true, vp: true };
  }

  function synthesize(state, p, rid, discount) {
    if (state.phase !== 'action' || state.turn.p !== p) return { ok: false, error: '现在不能合成' };
    if (state.turn.synth >= 3) return { ok: false, error: '每回合最多合成 3 次' };
    if (!hasLab(state, p)) return { ok: false, error: '至少需要 1 座实验室才能合成' };
    var r = RECIPE[rid];
    if (!r) return { ok: false, error: '没有这张配方' };
    var pl = state.players[p];
    var short = null;
    Object.keys(r.atoms).forEach(function (e) {
      if ((pl.res[e] || 0) < r.atoms[e]) short = e;
    });
    if (short) return { ok: false, error: '元素不够（缺 ' + short + '）' };
    Object.keys(r.atoms).forEach(function (e) {
      pl.res[e] -= r.atoms[e];
      state.bank[e] += r.atoms[e];
    });
    pl.prod[rid] = (pl.prod[rid] || 0) + 1;
    state.turn.synth++;
    log(state, pl.name + ' 合成 ' + formulaOf(r) + '（' + state.turn.synth + '/3）', 'chem');
    return { ok: true };
  }

  function formulaOf(r) {
    return r.formula.replace(/~/g, '').replace(/\^/g, '');
  }

  /* ------------------------------------------------------------------- goals */
  function goalRequiresFactory(g) {
    return !!g.factory;
  }

  function completeGoal(state, p, marketIdx, opts) {
    if (state.phase !== 'action' || state.turn.p !== p) return { ok: false, error: '现在不能完成目标' };
    if (state.turn.goalsDone >= 1) return { ok: false, error: '每回合最多完成 1 张目标卡' };
    var gid = state.market[marketIdx];
    if (!gid) return { ok: false, error: '这个位置没有目标卡' };
    var g = GOAL[gid];
    var pl = state.players[p];
    if (goalRequiresFactory(g) && !hasFactory(state, p)) {
      return { ok: false, error: '“' + g.condition + '”目标需要至少 1 座工厂' };
    }
    if (!canPayGoal(pl, g)) return { ok: false, error: '反应物不够', detail: goalPay(g) };
    goalPay(g).forEach(function (x) {
      if (x.kind === 'token') {
        pl.res[x.el] -= x.n;
        state.bank[x.el] += x.n;
      } else {
        pl.prod[x.rid] -= x.n;
        if (pl.prod[x.rid] === 0) delete pl.prod[x.rid];
      }
    });
    pl.goals.push(gid);
    state.turn.goalsDone++;
    state.market[marketIdx] = state.goalDeck.shift() || null;
    log(state, pl.name + ' 完成 ' + g.id + '「' + g.title + '」+ ' + g.vp + ' 分', 'goal');
    checkWin(state);
    return { ok: true, vp: g.vp };
  }

  function refreshMarketWith(state, p, marketIdx, elem) {
    if (state.phase !== 'action' || state.turn.p !== p) return { ok: false, error: '现在不能刷新' };
    if (!state.market[marketIdx]) return { ok: false, error: '这个位置没有卡' };
    var pl = state.players[p];
    if (!pl.res[elem]) return { ok: false, error: '没有这个元素' };
    pl.res[elem]--; state.bank[elem]++;
    state.market[marketIdx] = state.goalDeck.shift() || null;
    log(state, pl.name + ' 花 1' + elem + ' 刷新了一张目标卡', 'muted');
    return { ok: true };
  }

  /* --------------------------------------------------------------- pollution */
  function treatPollution(state, p) {
    if (state.phase !== 'action' || state.turn.p !== p) return { ok: false, error: '现在不能治理' };
    if (state.polluted === null) return { ok: false, error: '现在没有污染' };
    var pl = state.players[p];
    if ((pl.res.O || 0) < 2) return { ok: false, error: '治理污染需要 2O' };
    pl.res.O -= 2;
    state.bank.O += 2;
    pl.env++;
    state.polluted = null;
    log(state, pl.name + ' 花 2O 治理污染，获得环保标记', 'ok');
    checkWin(state);
    return { ok: true };
  }

  /* ---------------------------------------------------------------- scoring */
  function vpBase(state, p) {
    var vp = 0;
    Object.keys(state.buildings).forEach(function (k) {
      var b = state.buildings[k];
      if (b.p !== p) return;
      vp += b.type === 'factory' ? 2 : 1;
    });
    state.players[p].goals.forEach(function (gid) { vp += GOAL[gid].vp; });
    vp += Math.min(1, Math.floor(state.players[p].env / 2));
    return vp;
  }

  // 反应链 +2 实时计入：链长只增不减，所以「到分即胜」不会出现终局反超
  var _chainCache = Object.create(null);
  function chainLen(goals) {
    var key = goals.join(',');
    var v = _chainCache[key];
    if (v === undefined) {
      v = longestChain(goals).len;
      if (Object.keys(_chainCache).length > 500) _chainCache = Object.create(null);
      _chainCache[key] = v;
    }
    return v;
  }

  function chainBonusOf(state, p) {
    return chainLen(state.players[p].goals) >= 3 ? 2 : 0;
  }

  function vpOf(state, p) {
    return vpBase(state, p) + chainBonusOf(state, p);
  }

  function checkWin(state) {
    for (var i = 0; i < state.n; i++) {
      if (vpOf(state, i) >= state.vpGoal) {
        state.phase = 'over';
        state.winner = i;
        log(state, state.players[i].name + ' 达到 ' + state.vpGoal + ' 分，游戏结束！', 'win');
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------ chemistry IO */
  function normFormula(s) {
    return s
      .replace(/[~^]/g, '')
      .replace(/[₀-₉]/g, function (c) { return String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)); })
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, '')
      .replace(/[↑↓]/g, '')
      .replace(/[()（）\s]/g, '')
      .replace(/^\d+/, '');
  }

  function splitSide(s) {
    return s.split('+').map(function (x) { return normFormula(x.trim()); }).filter(Boolean);
  }

  function parseEquation(eq) {
    var arrow = eq.indexOf('→') >= 0 ? '→' : '⇌';
    var parts = eq.split(arrow);
    return { lhs: splitSide(parts[0] || ''), rhs: splitSide(parts[1] || '') };
  }

  function longestChain(goalIds) {
    var cards = goalIds.map(function (id) {
      var g = GOAL[id];
      var p = parseEquation(g.equation);
      return { id: id, lhs: p.lhs, rhs: p.rhs };
    });
    var n = cards.length;
    if (n === 0) return { len: 0, chain: [] };
    if (n > 12) n = 12;
    var memo = {};
    function dfs(last, mask) {
      var mk = last + ':' + mask;
      if (memo[mk]) return memo[mk];
      var best = { len: 1, chain: [cards[last].id] };
      for (var j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        if (!cards[j].lhs.some(function (f) { return cards[last].rhs.indexOf(f) >= 0; })) continue;
        var sub = dfs(j, mask | (1 << j));
        if (1 + sub.len > best.len) best = { len: 1 + sub.len, chain: [cards[last].id].concat(sub.chain) };
      }
      memo[mk] = best;
      return best;
    }
    var best = { len: 0, chain: [] };
    for (var i = 0; i < n; i++) {
      var r = dfs(i, 1 << i);
      if (r.len > best.len) best = r;
    }
    return best;
  }

  function finalScores(state) {
    return state.players.map(function (pl, i) {
      var chain = longestChain(pl.goals);
      var chainBonus = chain.len >= 3 ? 2 : 0;
      return {
        player: i,
        name: pl.name,
        vp: vpBase(state, i) + chainBonus,
        base: vpBase(state, i),
        labs: Object.keys(state.buildings).filter(function (k) { return state.buildings[k].p === i && state.buildings[k].type === 'lab'; }).length,
        factories: Object.keys(state.buildings).filter(function (k) { return state.buildings[k].p === i && state.buildings[k].type === 'factory'; }).length,
        goals: pl.goals.length,
        chain: chain,
        chainBonus: chainBonus,
        env: pl.env
      };
    });
  }

  /* ------------------------------------------------------------------ ending */
  function endTurn(state) {
    if (state.phase !== 'action') return { ok: false, error: '现在不能结束回合' };
    state.turn.p = (state.turn.p + 1) % state.n;
    state.turn.synth = 0;
    state.turn.goalsDone = 0;
    state.phase = 'roll';
    log(state, '轮到 ' + state.players[state.turn.p].name, 'turn');
    return { ok: true };
  }

  function winnerOf(state) {
    if (state.winner === null) return null;
    var scores = finalScores(state);
    return scores[state.winner];
  }

  /* -------------------------------------------------------------------- api */
  var api = {
    DATA: DATA,
    ELEMENTS: ELEMENTS,
    ENAMES: ENAMES,
    ECOLORS: ECOLORS,
    PROB: PROB,
    RECIPE: RECIPE,
    GOAL: GOAL,
    COLOR_HEX: COLOR_HEX,
    geometry: buildGeo,
    newGame: newGame,
    roll: roll,
    produce: produce,
    placePollution: placePollution,
    steal: steal,
    skipSteal: skipSteal,
    tradeBank: tradeBank,
    tradePort: tradePort,
    tradePlayers: tradePlayers,
    portForPlayer: portForPlayer,
    portAccepts: portAccepts,
    buildPipe: buildPipe,
    buildLab: buildLab,
    buildFactory: buildFactory,
    synthesize: synthesize,
    completeGoal: completeGoal,
    refreshMarketWith: refreshMarketWith,
    treatPollution: treatPollution,
    endTurn: endTurn,
    vpOf: vpOf,
    vpBase: vpBase,
    chainLen: chainLen,
    finalScores: finalScores,
    winnerOf: winnerOf,
    goalAtoms: goalAtoms,
    goalPay: goalPay,
    canPayGoal: canPayGoal,
    goalRequiresFactory: goalRequiresFactory,
    hasLab: hasLab,
    hasFactory: hasFactory,
    legalLabVertices: legalLabVertices,
    legalPipeEdges: legalPipeEdges,
    placeSetupLab: placeSetupLab,
    placeSetupPipe: placeSetupPipe,
    setupPlayer: setupPlayer,
    setupRemaining: setupRemaining,
    totalTokens: totalTokens,
    totalProducts: totalProducts,
    formulaOf: formulaOf,
    parseEquation: parseEquation,
    longestChain: longestChain,
    normFormula: normFormula,
    currentPlayer: currentPlayer
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ElementIsland = api;
})(typeof window !== 'undefined' ? window : globalThis);
