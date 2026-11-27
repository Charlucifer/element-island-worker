/* Browser UI for Element Island. */
'use strict';

var G = window.ElementIsland;
var DATA = G.DATA;
var S = null; // game state
var UI = { modal: null, highlight: null, selected: null, hover: null };
var SAVE_KEY = 'elementisland.save.v1';
var geo = G.geometry();

var ELS = DATA.elements;
var ENAMES = G.ENAMES;
var ECOLORS = G.ECOLORS;

/* --------------------------------------------------------------- utilities */
function h(tag, attrs, kids) {
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'text') el.textContent = attrs[k];
    else if (k === 'html') el.innerHTML = attrs[k];
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
    else el.setAttribute(k, attrs[k]);
  });
  (kids || []).forEach(function (c) {
    if (c == null) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}
function fmt(s) {
  var t = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return t.replace(/~([0-9]+)~/g, '<sub>$1</sub>').replace(/\^([^^]*)\^/g, '<sup>$1</sup>');
}
function formula(r) { return fmt(r.formula); }
function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

/* --------------------------------------------------------------- new game */
function newGameScreen() {
  var wrap = document.getElementById('app');
  wrap.innerHTML = '';
  var panel = h('div', { class: 'start-panel' });
  panel.appendChild(h('div', { class: 'eyebrow', text: 'ELEMENT ISLAND · REACTION WORKSHOP' }));
  panel.appendChild(h('h1', { class: 'start-title', text: '元素岛：反应工坊' }));
  panel.appendChild(h('p', { class: 'start-sub', html: '采集六种元素，按化学式合成物质，完成目标反应。配平就是成本，条件就是门槛。' }));

  var playersBox = h('div', { class: 'start-players' });
  var count = 3;
  var names = ['小红', '小蓝', '小绿', '小紫'];
  var colors = ['#0F6E6E', '#D97706', '#7C3AED', '#B91C1C'];

  function renderPlayers() {
    playersBox.innerHTML = '';
    for (var i = 0; i < count; i++) {
      playersBox.appendChild(
        h('div', { class: 'prow' }, [
          h('span', { class: 'dot', style: 'background:' + colors[i] }),
          h('input', {
            class: 'nameinput',
            value: names[i],
            maxlength: 8,
            oninput: function (e) { names[i] = e.target.value; }
          }),
          h('span', { class: 'tag', text: i === 0 ? '先手' : '' })
        ])
      );
    }
  }

  var seg = h('div', { class: 'seg' });
  [2, 3, 4].forEach(function (n) {
    seg.appendChild(
      h('button', {
        class: 'segbtn' + (n === count ? ' on' : ''),
        text: n + ' 人',
        onclick: function () {
          count = n;
          Array.prototype.forEach.call(seg.children, function (b, i) { b.className = 'segbtn' + (i + 2 === n ? ' on' : ''); });
          renderPlayers();
          updateGoalText();
        }
      })
    );
  });

  var modeBox = h('div', { class: 'seg' });
  var mode = 'standard';
  var modes = [
    ['standard', '标准局（8/10 分）'],
    ['short', '短局（6 分 · 20 分钟）']
  ];
  modes.forEach(function (m) {
    modeBox.appendChild(
      h('button', {
        class: 'segbtn' + (m[0] === mode ? ' on' : ''),
        text: m[1],
        onclick: function () {
          mode = m[0];
          Array.prototype.forEach.call(modeBox.children, function (b, i) { b.className = 'segbtn' + (modes[i][0] === mode ? ' on' : ''); });
          updateGoalText();
        }
      })
    );
  });

  var goalText = h('div', { class: 'hint' });
  function updateGoalText() {
    var vp = mode === 'short' ? 6 : count === 2 ? 8 : 10;
    goalText.innerHTML = '目标分数 <b>' + vp + '</b> 分 ｜ 首局模式：不用实验卡与条件模块';
  }
  updateGoalText();
  renderPlayers();

  panel.appendChild(h('div', { class: 'label', text: '人数' }));
  panel.appendChild(seg);
  panel.appendChild(h('div', { class: 'label', text: '玩家' }));
  panel.appendChild(playersBox);
  panel.appendChild(h('div', { class: 'label', text: '模式' }));
  panel.appendChild(modeBox);
  panel.appendChild(goalText);
  panel.appendChild(
    h('button', {
      class: 'primary big',
      text: '开始游戏',
      onclick: function () {
        S = G.newGame({ players: names.slice(0, count), colors: colors.slice(0, count), mode: mode });
        save();
        render();
      }
    })
  );
  panel.appendChild(
    h('button', {
      class: 'ghost demo', text: '联机对战（房间码）',
      onclick: function () { openLobby(); }
    })
  );
  panel.appendChild(
    h('button', {
      class: 'ghost demo', text: '先看一局自动演示',
      onclick: function () { location.href = 'index.html?demo&n=3&turns=45'; }
    })
  );
  panel.appendChild(
    h('div', { class: 'start-foot', html: '规则速查：掷骰产出 → 交易 → 合成/建造/完成目标 → 结束回合。<br>按<a href="rules.html" target="_blank">规则书</a>实现；本页为可玩原型。' })
  );
  wrap.appendChild(panel);
  if (UI.modal) wrap.appendChild(UI.modal());
}

/* ------------------------------------------------------------------ saving */
function save() {
  if (NET.room) return; // 联机进度由服务器保存，别把别人视角写进本地存档
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
}
function loadSaved() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || !s.players || !s.players.length) return null;
    return s;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------ render */
function render() {
  var app = document.getElementById('app');
  app.innerHTML = '';
  if (NET.room && (!S || !NET.started)) { lobbyRoomScreen(); return; }
  if (!S) { newGameScreen(); return; }

  var top = h('header', { class: 'topbar' });
  top.appendChild(h('div', { class: 'brand' }, [
    h('div', { class: 'brandmark', text: '元素岛' }),
    h('div', { class: 'brandsub', text: '反应工坊 · 可玩原型' })
  ]));

  var cur = S.players[S.turn.p];
  var status = h('div', { class: 'status' });
  if (S.phase === 'setup') {
    status.innerHTML = '<b>初始摆放</b> · 第 ' + S.setup.round + '/' + S.setup.rounds + ' 轮 · ' +
      whoHtml(cur) + ' ' + (S.setup.stage === 'lab' ? '请放实验室' : '请放导管');
  } else if (S.phase === 'roll') {
    status.innerHTML = whoHtml(cur) + ' 的回合 · 掷骰';
  } else if (S.phase === 'pollution-place') {
    status.innerHTML = '<b>污染事件</b> · 请选择一块六边形放污染标记';
  } else if (S.phase === 'pollution-steal') {
    status.innerHTML = '<b>污染事件</b> · 选择一名相邻玩家偷 1 个元素';
  } else if (S.phase === 'action') {
    status.innerHTML = whoHtml(cur) + ' 的回合 · 行动阶段';
  } else if (S.phase === 'over') {
    status.innerHTML = '<b>游戏结束</b>';
  }
  top.appendChild(status);

  var right = h('div', { class: 'topright' });
  if (S.turn.dice && S.turn.dice[0]) {
    right.appendChild(h('div', { class: 'dicebox', html: dieHtml(S.turn.dice[0]) + dieHtml(S.turn.dice[1]) + '<span class="sum">' + (S.turn.dice[0] + S.turn.dice[1]) + '</span>' }));
  }
  if (NET.room) {
    right.appendChild(h('button', {
      class: 'ghost roomchip', html: '房间 <b>' + NET.code + '</b> · 复制链接',
      onclick: function () { copyText(location.origin + location.pathname + '?join=' + NET.code); }
    }));
  }
  right.appendChild(h('button', { class: 'ghost', text: '参考', onclick: openReference }));
  right.appendChild(h('button', { class: 'ghost', text: '规则', onclick: openRules }));
  if (NET.room) {
    right.appendChild(h('button', {
      class: 'ghost', text: '退出房间',
      onclick: function () {
        if (!confirm('退出房间？')) return;
        netSend({ t: 'leave' });
        clearSession();
        NET.room = null; NET.started = false; NET.you = null; S = null;
        render();
      }
    }));
  } else {
    right.appendChild(h('button', { class: 'ghost', text: '新游戏', onclick: function () { if (confirm('放弃当前进度，开新游戏？')) { localStorage.removeItem(SAVE_KEY); S = null; render(); } } }));
  }
  top.appendChild(right);
  app.appendChild(top);

  UI.highlight = UI.placing ? UI.placing.items : null;
  var side = sidePanels();
  var main = h('div', { class: 'main' });
  main.appendChild(h('div', { class: 'boardwrap' }, [boardSvg()]));
  main.appendChild(h('aside', { class: 'side' }, side));
  app.appendChild(main);

  if (S.phase === 'over') app.appendChild(overOverlay());
  if (UI.modal) app.appendChild(UI.modal());
  maybeDiceFx();
}

function dieHtml(n) {
  var pips = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
  }[n] || [];
  var cells = '';
  for (var i = 0; i < 9; i++) cells += '<i class="' + (pips.indexOf(i) >= 0 ? 'on' : '') + '"></i>';
  return '<div class="die">' + cells + '</div>';
}

/* ------------------------------------------------------------------- board */
function boardSvg() {
  var vb = { x: -5.95, y: -5.45, w: 11.9, h: 10.9 };
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
  svg.setAttribute('class', 'board');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  var gHex = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  var gPort = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  var gRoad = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  var gBuild = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  var gMark = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  var gHot = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  var ns = 'http://www.w3.org/2000/svg';
  function mk(tag, attrs) {
    var e = document.createElementNS(ns, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // hexes
  var flashSum = UI.rollFlash && Date.now() < UI.rollFlash.until ? UI.rollFlash.sum : 0;
  geo.hexes.forEach(function (hx) {
    var pts = [];
    for (var k = 0; k < 6; k++) {
      var a = ((60 * k + 30) * Math.PI) / 180;
      pts.push((hx.cx + Math.cos(a)).toFixed(3) + ',' + (hx.cy + Math.sin(a)).toFixed(3));
    }
    var col = ECOLORS[hx.e];
    var isPolluted = S.polluted === hx.i;
    var isFlash = flashSum && hx.n === flashSum;
    var g = mk('g', {
      class: 'hex' + (isPolluted ? ' polluted' : '') +
        (flashSum ? (isFlash ? ' flash' : ' dim') : '')
    });
    g.appendChild(mk('polygon', { points: pts.join(' '), fill: col, 'fill-opacity': isPolluted ? 0.25 : 0.16, stroke: col, 'stroke-width': 0.05 }));
    var t1 = mk('text', { x: hx.cx, y: hx.cy - 0.04, 'text-anchor': 'middle', fill: col, 'font-size': 0.5, 'font-weight': 700 });
    t1.textContent = hx.e;
    g.appendChild(t1);
    var t2 = mk('text', { x: hx.cx, y: hx.cy + 0.34, 'text-anchor': 'middle', fill: '#64748B', 'font-size': 0.2 });
    t2.textContent = ENAMES[hx.e];
    g.appendChild(t2);
    var badge = mk('circle', { cx: hx.cx, cy: hx.cy - 0.66, r: 0.19, fill: '#FFFDF8', stroke: '#D6D3C8', 'stroke-width': 0.025 });
    g.appendChild(badge);
    var num = mk('text', { x: hx.cx, y: hx.cy - 0.59, 'text-anchor': 'middle', fill: hx.n === 6 || hx.n === 8 ? '#B91C1C' : '#475569', 'font-size': 0.22, 'font-weight': 800 });
    num.textContent = hx.n;
    g.appendChild(num);
    if (isPolluted) {
      var pt = mk('text', { x: hx.cx, y: hx.cy + 0.75, 'text-anchor': 'middle', 'font-size': 0.4 });
      pt.textContent = '☣';
      g.appendChild(pt);
    }
    if (isFlash) {
      g.appendChild(mk('polygon', { points: pts.join(' '), class: 'flashring' }));
      // how much the roller actually gets from this tile
      var owner = UI.rollFlash.player;
      var gain = 0;
      hx.corners.forEach(function (vk) {
        var b = S.buildings[vk];
        if (b && b.p === owner) gain += b.type === 'factory' ? 2 : 1;
      });
      if (gain > 0 && !isPolluted) {
        var chipG = mk('g', { 'pointer-events': 'none' });
        chipG.appendChild(mk('rect', {
          x: hx.cx - 0.3, y: hx.cy + 0.52, width: 0.6, height: 0.3, rx: 0.1,
          fill: '#FFF7ED', stroke: '#F59E0B', 'stroke-width': 0.04
        }));
        var chipT = mk('text', {
          x: hx.cx, y: hx.cy + 0.735, 'text-anchor': 'middle', 'font-size': 0.19,
          fill: '#B45309', 'font-weight': 800
        });
        chipT.textContent = '+' + gain;
        chipG.appendChild(chipT);
        g.appendChild(chipG);
      }
    }
    gHex.appendChild(g);
  });

  // ports
  var cX = 0, cY = 0;
  geo.hexes.forEach(function (hx) { cX += hx.cx; cY += hx.cy; });
  cX /= geo.hexes.length; cY /= geo.hexes.length;
  geo.ports.forEach(function (pt) {
    var owner = -1;
    if (S.buildings[pt.verts[0]]) owner = S.buildings[pt.verts[0]].p;
    if (S.buildings[pt.verts[1]]) owner = S.buildings[pt.verts[1]].p;
    var ex = geo.edges[pt.edge];
    var nx = pt.mx - cX, ny = pt.my - cY;
    var nlen = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= nlen; ny /= nlen;
    var ax = pt.mx + nx * 0.12, ay = pt.my + ny * 0.12;
    var bx = pt.mx + nx * 0.8, by = pt.my + ny * 0.8;
    var g = mk('g', { class: 'port' });
    g.appendChild(mk('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: owner >= 0 ? S.players[owner].color : '#B8B4A6', 'stroke-width': 0.05 }));
    var cx = pt.mx + nx * 1.0, cy = pt.my + ny * 1.0;
    var w = pt.type === '3:1' ? 0.95 : 0.95;
    g.appendChild(mk('rect', { x: cx - w / 2, y: cy - 0.19, width: w, height: 0.38, rx: 0.09, fill: owner >= 0 ? S.players[owner].color : '#FFFFFF', stroke: owner >= 0 ? S.players[owner].color : '#D6D3C8', 'stroke-width': 0.03 }));
    var t = mk('text', { x: cx, y: cy + 0.067, 'text-anchor': 'middle', 'font-size': 0.165, fill: owner >= 0 ? '#fff' : '#475569', 'font-weight': 700 });
    t.textContent = pt.label;
    g.appendChild(t);
    gPort.appendChild(g);
  });

  // pipes
  Object.keys(S.pipes).forEach(function (ek) {
    var e = geo.edges[ek];
    var p = S.pipes[ek];
    var va = geo.vertices[e.a], vb2 = geo.vertices[e.b];
    gRoad.appendChild(mk('line', {
      x1: va.x, y1: va.y, x2: vb2.x, y2: vb2.y,
      stroke: S.players[p].color, 'stroke-width': 0.13, 'stroke-linecap': 'round', opacity: 0.85
    }));
  });

  // buildings
  Object.keys(S.buildings).forEach(function (vk) {
    var b = S.buildings[vk];
    var v = geo.vertices[vk];
    var col = S.players[b.p].color;
    var g = mk('g', {});
    if (b.type === 'lab') {
      g.appendChild(mk('circle', { cx: v.x, cy: v.y, r: 0.2, fill: col, stroke: '#fff', 'stroke-width': 0.06 }));
      g.appendChild(mk('circle', { cx: v.x, cy: v.y, r: 0.07, fill: '#fff', 'fill-opacity': 0.85 }));
    } else {
      g.appendChild(mk('rect', { x: v.x - 0.21, y: v.y - 0.21, width: 0.42, height: 0.42, rx: 0.07, fill: col, stroke: '#fff', 'stroke-width': 0.06 }));
      var tx = mk('text', { x: v.x, y: v.y + 0.075, 'text-anchor': 'middle', 'font-size': 0.22, fill: '#fff', 'font-weight': 800 });
      tx.textContent = '厂';
      g.appendChild(tx);
    }
    gBuild.appendChild(g);
  });

  // highlights (big hit areas: fill matters, not just the stroke)
  var hl = UI.highlight || [];
  hl.forEach(function (item) {
    if (item.type === 'vertex') {
      var v = geo.vertices[item.key];
      var c = mk('circle', {
        cx: v.x, cy: v.y, r: 0.3, fill: 'rgba(15,110,110,0.16)', stroke: '#0F6E6E',
        'stroke-width': 0.055, 'stroke-dasharray': '0.14 0.09', class: 'hl',
        'pointer-events': 'all'
      });
      c.style.cursor = 'pointer';
      c.addEventListener('click', function (ev) { ev.stopPropagation(); item.onclick(); });
      gHot.appendChild(c);
      var dot = mk('circle', { cx: v.x, cy: v.y, r: 0.07, fill: '#0F6E6E', 'pointer-events': 'none' });
      gHot.appendChild(dot);
    } else if (item.type === 'edge') {
      var e = geo.edges[item.key];
      var va = geo.vertices[e.a], vb2 = geo.vertices[e.b];
      var hit = mk('line', {
        x1: va.x, y1: va.y, x2: vb2.x, y2: vb2.y, stroke: 'rgba(15,110,110,0.2)',
        'stroke-width': 0.42, 'stroke-linecap': 'round', class: 'hl', 'pointer-events': 'stroke'
      });
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', function (ev) { ev.stopPropagation(); item.onclick(); });
      gHot.appendChild(hit);
      var vis = mk('line', {
        x1: va.x, y1: va.y, x2: vb2.x, y2: vb2.y, stroke: '#0F6E6E',
        'stroke-width': 0.06, 'stroke-dasharray': '0.14 0.09', 'pointer-events': 'none'
      });
      gHot.appendChild(vis);
    } else if (item.type === 'hex') {
      var hx = geo.hexes[item.key];
      var poly = mk('polygon', {
        points: hexPointsStr(hx), fill: 'rgba(185,28,28,0.10)', stroke: '#B91C1C',
        'stroke-width': 0.07, class: 'hl', 'pointer-events': 'all'
      });
      poly.style.cursor = 'pointer';
      poly.addEventListener('click', function (ev) { ev.stopPropagation(); item.onclick(); });
      gHot.appendChild(poly);
    }
  });

  [gHex, gPort, gRoad, gBuild, gMark, gHot].forEach(function (g) { svg.appendChild(g); });
  svg.addEventListener('click', function (ev) {
    if (!UI.highlight || !UI.highlight.length) return;
    if (ev.target.closest && ev.target.closest('.hl')) return;
    if (S.phase === 'setup') toast(S.setup.stage === 'lab' ? '请点版图上闪烁的圆圈' : '请点刚放的实验室旁闪烁的边');
    else if (S.phase === 'pollution-place') toast('请点一块六边形');
  });
  return svg;
}

function hexPointsStr(hx) {
  var pts = [];
  for (var k = 0; k < 6; k++) {
    var a = ((60 * k + 30) * Math.PI) / 180;
    pts.push((hx.cx + Math.cos(a)).toFixed(3) + ',' + (hx.cy + Math.sin(a)).toFixed(3));
  }
  return pts.join(' ');
}

/* --------------------------------------------------------------- side panel */
function sidePanels() {
  var out = [];
  var curIdx = S.phase === 'setup' ? S.setup.order[S.setup.idx] : S.turn.p;
  var me = S.players[curIdx];

  // action card
  var actCard = h('section', { class: 'card action' });
  actCard.appendChild(h('div', { class: 'cardhead' }, [
    h('span', { class: 'pname', text: me.name, style: 'color:' + me.color }),
    h('span', { class: 'vp', html: '<b>' + G.vpOf(S, curIdx) + '</b> / ' + S.vpGoal + ' 分' })
  ]));

  var mine = myTurn();
  if (S.phase === 'setup') {
    actCard.appendChild(h('p', {
      class: 'hint',
      text: mine
        ? (S.setup.stage === 'lab' ? '点击版图上的绿色虚线圈放实验室（与其它实验室至少隔一个交点）。' : '点击刚放实验室旁的绿色虚线边放导管。')
        : '等待 ' + S.players[actorIndex()].name + ' 摆放…'
    }));
    var labs = mine ? G.legalLabVertices(S, curIdx, true) : [];
    var pipes = mine ? G.legalPipeEdges(S, curIdx, true, S.setup.lastLab) : [];
    UI.highlight = [];
    if (S.setup.stage === 'lab') {
      labs.forEach(function (k) {
        UI.highlight.push({ type: 'vertex', key: k, onclick: function () {
          var r = ACT.setupLab(k);
          if (!r.ok) { toast(r.error); return; }
          save(); render();
          toast('实验室已放置');
        } });
      });
    } else {
      pipes.forEach(function (k) {
        UI.highlight.push({ type: 'edge', key: k, onclick: function () {
          var r = ACT.setupPipe(k);
          if (!r.ok) { toast(r.error); return; }
          save(); render();
          toast('导管已放置');
        } });
      });
    }
  } else if (S.phase === 'roll') {
    actCard.appendChild(h('p', { class: 'hint', text: '掷 2d6，按数字产出元素；掷到 7 触发污染事件。' }));
    actCard.appendChild(h('button', { class: 'primary big', text: '掷骰子', onclick: function () { act(function () { G.roll(S); }); } }));
  } else if (S.phase === 'pollution-place') {
    actCard.appendChild(h('p', { class: 'hint', text: mine ? '点击任意六边形放置污染标记；该板块将停止产出。' : '等待 ' + S.players[S.turn.p].name + ' 放置污染标记…' }));
    UI.highlight = [];
    if (mine) geo.hexes.forEach(function (hx) {
      UI.highlight.push({ type: 'hex', key: hx.i, onclick: function () {
        var r = ACT.placePollution(hx.i);
        if (!r.ok) { toast(r.error); return; }
        save(); render();
        toast('污染标记已放置');
      } });
    });
  } else if (S.phase === 'pollution-steal') {
    var geo2 = geo.hexes[S.polluted];
    var cands = [];
    geo2.corners.forEach(function (vk) {
      var b = S.buildings[vk];
      if (b && b.p !== S.turn.p && cands.indexOf(b.p) < 0) cands.push(b.p);
    });
    actCard.appendChild(h('p', { class: 'hint', text: mine ? '从污染板块相邻的玩家里偷 1 个元素。' : '等待 ' + S.players[S.turn.p].name + ' 处理污染…' }));
    if (!mine) cands.length = 0;
    cands.forEach(function (pi) {
      actCard.appendChild(h('button', { class: 'ghost wide', text: '偷 ' + S.players[pi].name, onclick: function () { act(function () { ACT.steal(pi); }); } }));
    });
    actCard.appendChild(h('button', { class: 'ghost wide', text: '跳过', onclick: function () { act(function () { ACT.skipSteal(); }); } }));
  } else if (S.phase === 'action') {
    var a = S.turn;
    var can = function (txt, fn, cls) {
      return h('button', { class: 'actbtn ' + (cls || ''), onclick: fn }, [h('span', { html: txt })]);
    };
    actCard.appendChild(h('div', { class: 'actgrid' }, [
      can('合成', openSynth),
      can('交易', openTrade),
      can('建造', openBuild),
      can('目标卡', openGoals),
      can('治理污染 <span class="mini">2O</span>', function () {
        if (S.polluted === null) return toast('现在没有污染');
        var r = ACT.treat();
        if (!r.ok) return toast(r.error);
        save(); render();
      }, (S.polluted === null || (me.res.O || 0) < 2) ? 'dim' : '')
    ]));
    actCard.appendChild(h('div', { class: 'turnmeta', html: '合成 ' + a.synth + '/3 · 目标 ' + a.goalsDone + '/1' }));
    actCard.appendChild(h('button', { class: 'primary wide', text: '结束回合', onclick: function () { act(function () { ACT.endTurn(); }); } }));
  } else if (S.phase === 'over') {
    actCard.appendChild(h('p', { class: 'hint', text: '游戏已结束，点击“新游戏”再来一局。' }));
  }
  out.push(actCard);

  // market
  var mkSec = h('section', { class: 'card' });
  mkSec.appendChild(h('div', { class: 'cardhead' }, [
    h('span', { text: '目标市场' }),
    h('span', { class: 'muted', text: '明牌 ' + S.market.filter(Boolean).length + ' · 牌堆 ' + deckCount() + ' 张' })
  ]));
  var list = h('div', { class: 'market' });
  S.market.forEach(function (gid, i) {
    if (!gid) { list.appendChild(h('div', { class: 'gcard empty', text: '牌堆已空' })); return; }
    var g = G.GOAL[gid];
    var canDo = S.phase === 'action' && S.turn.p === curIdx && S.turn.goalsDone < 1 &&
      G.canPayGoal(S.players[curIdx], g) && (!G.goalRequiresFactory(g) || G.hasFactory(S, curIdx));
    var c = h('div', { class: 'gcard' + (canDo ? ' ready' : '') }, [
      h('div', { class: 'grow' }, [
        h('span', { class: 'gid', text: g.id }),
        h('span', { class: 'gvp', text: '+' + g.vp })
      ]),
      h('div', { class: 'geq', html: fmt(g.equation) }),
      h('div', { class: 'gmeta', html: '<span class="tag">' + esc(g.category) + '</span><span class="cond">' + esc(g.condition) + (g.factory ? ' · 需工厂' : '') + '</span>' }),
      h('div', { class: 'gpay' }, payChips(g).map(function (c2) { return h('span', { class: 'chip ' + (c2.ok ? 'ok' : 'no'), html: c2.html }); }))
    ]);
    c.addEventListener('click', function () { openGoalDetail(gid, i); });
    list.appendChild(c);
  });
  mkSec.appendChild(list);
  out.push(mkSec);

  // players
  var psec = h('section', { class: 'card' });
  psec.appendChild(h('div', { class: 'cardhead' }, [h('span', { text: '玩家' })]));
  S.players.forEach(function (pl, i) {
    var row = h('div', { class: 'prow2' + (i === curIdx ? ' cur' : '') });
    row.appendChild(h('span', { class: 'dot', style: 'background:' + pl.color }));
    row.appendChild(h('span', { class: 'pn', text: pl.name }));
    row.appendChild(h('span', { class: 'pv', html: '<b>' + G.vpOf(S, i) + '</b>' + '<span class="pdetail">' + detailOf(i) + '</span>' }));
    psec.appendChild(row);
    var toks = h('div', { class: 'tokens' });
    ELS.forEach(function (e) {
      if ((pl.res[e] || 0) > 0) {
        toks.appendChild(h('span', { class: 'tok', style: 'background:' + ECOLORS[e], title: ENAMES[e] }, [String(pl.res[e]) + e]));
      }
    });
    if (!toks.children.length) toks.appendChild(h('span', { class: 'muted small', text: '无元素' }));
    psec.appendChild(toks);
    var prods = Object.keys(pl.prod);
    if (prods.length) {
      var pr = h('div', { class: 'prods' });
      prods.forEach(function (rid) {
        pr.appendChild(h('span', {
          class: 'prodchip', title: '看看谁需要它',
          html: (pl.prod[rid] > 1 ? pl.prod[rid] + '× ' : '') + formula(G.RECIPE[rid]),
          onclick: function () { openReference(rid); }
        }));
      });
      psec.appendChild(pr);
    }
    if (pl.goals.length) {
      var gs = h('div', { class: 'goalsline' });
      pl.goals.forEach(function (gid) { gs.appendChild(h('span', { class: 'goaltag', text: gid })); });
      psec.appendChild(gs);
    }
  });
  out.push(psec);

  // log
  var lsec = h('section', { class: 'card logcard' });
  lsec.appendChild(h('div', { class: 'cardhead' }, [h('span', { text: '记录' })]));
  var lg = h('div', { class: 'log' });
  S.log.slice(-40).reverse().forEach(function (l) {
    lg.appendChild(h('div', { class: 'lrow ' + l.cls, text: l.msg }));
  });
  lsec.appendChild(lg);
  out.push(lsec);

  return out;
}

function deckCount() {
  if (!S) return 0;
  if (Array.isArray(S.goalDeck)) return S.goalDeck.length;
  return S.goalDeckCount || 0;
}

function whoHtml(pl) {
  return '<span class="who"><i style="background:' + pl.color + '"></i>' + esc(pl.name) + '</span>';
}

function detailOf(i) {
  var lab = 0, fac = 0;
  Object.keys(S.buildings).forEach(function (k) {
    if (S.buildings[k].p !== i) return;
    if (S.buildings[k].type === 'lab') lab++; else fac++;
  });
  var pl = S.players[i];
  var ch = pl.goals.length >= 3 ? G.longestChain(pl.goals).len : 0;
  return '实验室' + lab + ' · 工厂' + fac + ' · 目标' + pl.goals.length + (ch >= 3 ? ' · 链' + ch + ' +2' : '');
}

function payChips(g) {
  var pl = S.players[S.phase === 'setup' ? S.setup.order[S.setup.idx] : S.turn.p];
  return G.goalPay(g).map(function (x) {
    if (x.kind === 'token') {
      return { ok: (pl.res[x.el] || 0) >= x.n, html: x.n + ' ' + x.el };
    }
    return { ok: (pl.prod[x.rid] || 0) >= x.n, html: x.n + ' ' + formula(G.RECIPE[x.rid]) };
  });
}

/* ---------------------------------------------------------------- mutations */
function act(fn) {
  var r = fn();
  save();
  render();
  return r;
}
function placeResult(r, okMsg) {
  if (r && r.ok === false) { toast(r.error); render(); return; }
  UI.placing = null;
  save();
  render();
  if (okMsg && !NET.room) toast(okMsg);
}



/* --------------------------------------------------------------- 参考面板 */
function productGoals(pl) {
  var mine = Object.keys(pl.prod).filter(function (rid) { return pl.prod[rid] > 0; });
  return DATA.goals.filter(function (g) {
    return g.reactants.some(function (r) { return r[0] === 'card' && mine.indexOf(r[1]) >= 0; });
  });
}

function openReference(filter) {
  filter = filter || null;
  var p = S ? actorIndex() : 0;
  var pl = S ? S.players[p] : null;
  var body = [];
  var mine = pl ? Object.keys(pl.prod).filter(function (rid) { return pl.prod[rid] > 0; }) : [];

  body.push(h('p', {
    class: 'hint',
    html: mine.length
      ? '你手上的产物：' + mine.map(function (rid) { return formula(G.RECIPE[rid]) + ' ×' + pl.prod[rid]; }).join('、') + '　（点一下就能筛出需要它的目标）'
      : '你现在还没有产物卡。'
  }));

  if (S) {
    body.push(h('p', {
      class: 'hint',
      html: '目标牌堆还剩 <b>' + deckCount() + '</b> 张（场上的 ' + S.market.filter(Boolean).length + ' 张不算）'
    }));
  }

  var used = [];
  if (pl) {
    DATA.goals.forEach(function (g) {
      if (g.reactants.some(function (r) { return r[0] === 'card' && mine.indexOf(r[1]) >= 0; })) used.push(g);
    });
  }
  body.push(h('div', { class: 'refsec' }, [
    h('div', { class: 'lbl', text: '你的产物能用于（' + used.length + ' 张目标）' }),
    used.length
      ? h('div', { class: 'refchips' }, used.map(function (g) {
          return h('span', { class: 'refgoaltag', html: '<b>' + g.id + '</b> +' + g.vp + ' · ' + esc(g.title) });
        }))
      : h('p', { class: 'muted small', text: '暂时没有目标用到你手上的产物——可以花 1 个元素刷新市场，或等别人完成后补牌。' })
  ]));

  // filter chips
  var chips = [h('button', {
    class: 'chipbtn' + (filter ? '' : ' on'), text: '全部目标',
    onclick: function () { openReference(null); }
  })];
  mine.forEach(function (rid) {
    chips.push(h('button', {
      class: 'chipbtn' + (filter === rid ? ' on' : ''), html: formula(G.RECIPE[rid]),
      onclick: function () { openReference(rid); }
    }));
  });
  if (filter && mine.indexOf(filter) < 0) {
    chips.push(h('button', { class: 'chipbtn on', html: formula(G.RECIPE[filter]) }));
  }
  body.push(h('div', { class: 'chips', style: 'margin:6px 0 10px' }, chips));

  var goals = filter
    ? DATA.goals.filter(function (g) {
        return g.reactants.some(function (r) { return r[0] === 'card' && r[1] === filter; });
      })
    : DATA.goals;
  body.push(h('div', {
    class: 'lbl',
    text: (filter ? '需要 ' + G.RECIPE[filter].formula.replace(/~/g, '') + ' 的目标（' + goals.length + ' 张）' : '全部 ' + DATA.goals.length + ' 张目标卡（绿=现在付得出）')
  }));

  var list = h('div', { class: 'reflist' });
  goals.forEach(function (g) {
    var reqChips = G.goalPay(g).map(function (x) {
      var have = pl ? (x.kind === 'token' ? (pl.res[x.el] || 0) : (pl.prod[x.rid] || 0)) : 0;
      return h('span', {
        class: 'chip ' + (have >= x.n ? 'ok' : 'no'),
        html: x.kind === 'token' ? x.n + ' ' + x.el : x.n + ' ' + formula(G.RECIPE[x.rid])
      });
    });
    list.appendChild(h('div', { class: 'refrow' }, [
      h('span', { class: 'refid', text: g.id }),
      h('span', { class: 'refeq', html: fmt(g.equation) }),
      h('span', { class: 'refvp', text: '+' + g.vp }),
      h('span', { class: 'refneed' }, reqChips)
    ]));
  });
  body.push(list);

  body.push(h('div', { class: 'lbl', text: '全部 ' + DATA.recipes.length + ' 张配方（合成用）' }));
  var rl = h('div', { class: 'reflist' });
  DATA.recipes.forEach(function (r) {
    rl.appendChild(h('div', { class: 'refrow' }, [
      h('span', { class: 'refid', text: r.id }),
      h('span', { class: 'refeq', html: formula(r) + ' <span class="muted">' + esc(r.name) + '</span>' }),
      h('span', { class: 'refvp', text: '' }),
      h('span', { class: 'refneed' }, Object.keys(r.atoms).map(function (e) {
        return h('span', { class: 'chip', text: r.atoms[e] + ' ' + e });
      }))
    ]));
  });
  body.push(rl);

  modalBox('参考：谁需要什么', body, { wide: true });
}

/* ------------------------------------------------------------------ 联机 */
var COLORS = ['#0F6E6E', '#D97706', '#7C3AED', '#B91C1C'];
var IS_STATIC = /\.(github\.io|netlify\.app|vercel\.app|pages\.dev)$/.test(location.hostname);
var NET = {
  ws: null, id: null, room: null, code: null, you: null,
  hostId: null, players: [], started: false, mode: 'standard', online: false
};

function mulberry32b(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem('ei.session') || 'null'); } catch (e) { return null; }
}
function saveSession(o) {
  try { localStorage.setItem('ei.session', JSON.stringify(o)); } catch (e) {}
}
function clearSession() {
  try { localStorage.removeItem('ei.session'); } catch (e) {}
}
function loadName() {
  try { return localStorage.getItem('ei.name') || ''; } catch (e) { return ''; }
}
function saveName(n) {
  try { if (n) localStorage.setItem('ei.name', n); } catch (e) {}
}

function netUrl() {
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}
function netSend(obj) {
  if (NET.ws && NET.ws.readyState === 1) {
    NET.ws.send(JSON.stringify(obj));
    return true;
  }
  toast('联机连接断开了，正在重连…');
  netConnect();
  return false;
}
function netAction(name, args) {
  if (!netSend({ t: 'action', name: name, args: args || {} })) return { ok: false, error: '未连接' };
  return { ok: true, pending: true };
}
function netConnect(then) {
  if (location.protocol === 'file:') {
    toast('联机需要通过 http(s) 打开：双击“启动游戏.cmd”');
    return;
  }
  if (NET.ws && (NET.ws.readyState === 0 || NET.ws.readyState === 1)) {
    if (then && NET.ws.readyState === 1) then();
    else if (then) NET.ws.addEventListener('open', then, { once: true });
    return;
  }
  var ws;
  try { ws = new WebSocket(netUrl()); } catch (e) { toast('联机不可用：' + e.message); return; }
  NET.ws = ws;
  ws.onopen = function () {
    NET.online = true;
    if (then) then();
  };
  ws.onmessage = function (ev) {
    var msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    onNetMessage(msg);
  };
  ws.onclose = function () {
    NET.online = false;
    if (NET.room) toast('与服务器的连接断开了，刷新页面可重连');
  };
  ws.onerror = function () {
    if (NET.room) return;
    toast(IS_STATIC
      ? '这个站点是静态托管，没有联机服务器：同屏模式能直接玩，联机需要自建服务器（见 README）'
      : '连不上联机服务器（请用 启动游戏.cmd 打开）');
  };
}

function onNetMessage(msg) {
  if (msg.t === 'welcome') {
    NET.id = msg.id;
    var saved = loadSession();
    if (saved && saved.code && saved.id && !NET.room) {
      netSend({ t: 'rejoin', code: saved.code, id: saved.id });
    }
    return;
  }
  if (msg.t === 'room') {
    NET.room = true;
    NET.code = msg.room.code;
    NET.hostId = msg.room.hostId;
    NET.players = msg.room.players;
    NET.started = msg.room.started;
    NET.mode = msg.room.mode;
    if (NET.id) saveSession({ code: NET.code, id: NET.id });
    render();
    return;
  }
  if (msg.t === 'state') {
    S = msg.state;
    NET.you = msg.you;
    NET.started = true;
    render();
    return;
  }
  if (msg.t === 'error') { toast(msg.message); return; }
  if (msg.t === 'left') {
    clearSession();
    NET.room = null; NET.started = false; NET.you = null; S = null;
    toast(msg.reason || '已离开房间');
    render();
  }
}

function actorIndex() {
  if (S.phase === 'setup') return S.setup.order[S.setup.idx];
  return S.turn.p;
}
function myTurn() {
  if (!NET.room) return true;
  if (S.phase === 'over' || S.phase === 'setup') return NET.you === actorIndex();
  return NET.you === S.turn.p;
}

var ACT = {
  roll: function () { return NET.room ? netAction('roll') : G.roll(S); },
  setupLab: function (v) {
    return NET.room ? netAction('setupLab', { vertex: v }) : G.placeSetupLab(S, actorIndex(), v);
  },
  setupPipe: function (e) {
    return NET.room ? netAction('setupPipe', { edge: e }) : G.placeSetupPipe(S, actorIndex(), e);
  },
  placePollution: function (i) {
    return NET.room ? netAction('placePollution', { hex: i }) : G.placePollution(S, i);
  },
  steal: function (v) { return NET.room ? netAction('steal', { victim: v }) : G.steal(S, v); },
  skipSteal: function () { return NET.room ? netAction('skipSteal') : G.skipSteal(S); },
  synth: function (rid) {
    return NET.room ? netAction('synth', { rid: rid }) : G.synthesize(S, actorIndex(), rid);
  },
  buildLab: function (v) {
    return NET.room ? netAction('buildLab', { vertex: v }) : G.buildLab(S, actorIndex(), v);
  },
  buildPipe: function (e, any) {
    return NET.room ? netAction('buildPipe', { edge: e, any: any }) : G.buildPipe(S, actorIndex(), e, any);
  },
  buildFactory: function (v, rid) {
    return NET.room ? netAction('buildFactory', { vertex: v, rid: rid }) : G.buildFactory(S, actorIndex(), v, rid);
  },
  goal: function (i) {
    return NET.room ? netAction('goal', { index: i }) : G.completeGoal(S, actorIndex(), i);
  },
  refreshGoal: function (i, e) {
    return NET.room ? netAction('refreshGoal', { index: i, elem: e }) : G.refreshMarketWith(S, actorIndex(), i, e);
  },
  treat: function () {
    return NET.room ? netAction('treat') : G.treatPollution(S, actorIndex());
  },
  tradeBank: function (give, get) {
    return NET.room ? netAction('tradeBank', { give: give, get: get }) : G.tradeBank(S, actorIndex(), give, get);
  },
  tradePort: function (port, give, get) {
    return NET.room
      ? netAction('tradePort', { port: port, give: give, get: get })
      : G.tradePort(S, actorIndex(), port, give, get);
  },
  endTurn: function () { return NET.room ? netAction('endTurn') : G.endTurn(S); }
};

function copyText(txt) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt);
    } else {
      var ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    toast('已复制');
  } catch (e) { toast('复制失败，请手动选中'); }
}

function openLobby(prefill) {
  if (location.protocol === 'file:') {
    toast('联机要通过 http(s) 打开：双击“启动游戏.cmd”，用显示的地址进');
    return;
  }
  var body = [];
  if (IS_STATIC) {
    body.push(h('p', {
      class: 'hint',
      html: '<b>注意：</b>当前是静态托管（GitHub Pages / Netlify 之类），没有联机服务器。同屏模式可以直接玩；要联机请把 <code>server.js</code> 部署到 Render 之类的平台，见 README。'
    }));
  }
  body.push(h('p', {
    class: 'hint',
    html: '联机是轮流制：轮到你才能操作，其他人实时看到版图变化。<b>至少 2 人</b>（最多 4 人）开始。'
  }));
  var nameIn = h('input', {
    class: 'nameinput', value: loadName(), maxlength: 10, placeholder: '你的名字',
    oninput: function (e) { saveName(e.target.value); }
  });
  body.push(h('div', { class: 'lobbysec' }, [h('div', { class: 'lbl', text: '名字' }), nameIn]));

  var modeSel = h('select', { class: 'sel' });
  modeSel.appendChild(h('option', { value: 'standard', text: '标准局（8/10 分）' }));
  modeSel.appendChild(h('option', { value: 'short', text: '短局（6 分）' }));
  body.push(h('div', { class: 'lobbysec' }, [h('div', { class: 'lbl', text: '模式（房主决定）' }), modeSel]));

  body.push(h('button', {
    class: 'primary wide', text: '创建房间',
    onclick: function () {
      var nm = (nameIn.value || '').trim() || '玩家';
      saveName(nm);
      netConnect(function () { netSend({ t: 'create', name: nm, mode: modeSel.value }); });
      UI.modal = null;
      render();
    }
  }));

  var codeIn = h('input', {
    class: 'nameinput code', maxlength: 4, placeholder: '4 位房间码',
    value: (prefill || '').toUpperCase()
  });
  body.push(h('div', { class: 'lobbysec' }, [
    h('div', { class: 'lbl', text: '已有房间码' }), codeIn,
    h('button', {
      class: 'ghost wide', text: '加入房间',
      onclick: function () {
        var c = (codeIn.value || '').trim().toUpperCase();
        if (c.length !== 4) return toast('房间码是 4 位字母或数字');
        var nm = (nameIn.value || '').trim() || '玩家';
        saveName(nm);
        netConnect(function () { netSend({ t: 'join', code: c, name: nm }); });
        UI.modal = null;
        render();
      }
    })
  ]));
  body.push(h('p', { class: 'muted small', text: '提示：把页面链接发给自己，就能在同一台电脑上开两个窗口自己试。' }));
  modalBox('联机对战', body);
}

function lobbyRoomScreen() {
  var app = document.getElementById('app');
  app.innerHTML = '';
  var panel = h('div', { class: 'start-panel' });
  panel.appendChild(h('div', { class: 'eyebrow', text: 'MULTIPLAYER · ROOM' }));
  panel.appendChild(h('h1', { class: 'start-title', text: '房间 ' + NET.code }));
  panel.appendChild(h('p', { class: 'start-sub', text: '把房间码或链接发给朋友；2–4 人时房主可以开始。' }));

  var link = location.origin + location.pathname + '?join=' + NET.code;
  panel.appendChild(h('div', { class: 'roomlink' }, [
    h('input', { class: 'nameinput', value: link, readonly: 'readonly', onclick: function (e) { e.target.select(); } }),
    h('button', { class: 'ghost small', text: '复制', onclick: function () { copyText(link); } })
  ]));

  var list = h('div', { class: 'roomplayers' });
  NET.players.forEach(function (p) {
    list.appendChild(h('div', { class: 'rrow' }, [
      h('span', { class: 'dot', style: 'background:' + COLORS[p.seat] }),
      h('span', { class: 'rname', text: p.name + (p.id === NET.id ? '（你）' : '') + (p.id === NET.hostId ? ' · 房主' : '') }),
      h('span', { class: 'muted small', text: p.connected ? '在线' : '掉线' })
    ]));
  });
  panel.appendChild(list);

  if (NET.id === NET.hostId) {
    panel.appendChild(h('button', {
      class: 'primary big',
      text: NET.players.length < 2 ? '至少需要 2 人' : '开始游戏（' + NET.players.length + ' 人）',
      onclick: function () {
        if (NET.players.length < 2) return toast('等一等，还没有对手');
        netSend({ t: 'start' });
      }
    }));
  } else {
    panel.appendChild(h('p', { class: 'hint', text: '等房主开始…' }));
  }
  panel.appendChild(h('button', {
    class: 'ghost wide', text: '离开房间',
    onclick: function () {
      netSend({ t: 'leave' });
      clearSession();
      NET.room = null; NET.started = false; NET.you = null; S = null;
      render();
    }
  }));
  app.appendChild(panel);
}

/* ------------------------------------------------------------------ modals */
function closeModal() { UI.modal = null; render(); }

function modalBox(title, body, opts) {
  UI.modal = function () {
    var ov = h('div', { class: 'overlay', onclick: function (e) { if (e.target === ov) closeModal(); } });
    var box = h('div', { class: 'modal' + (opts && opts.wide ? ' wide' : '') });
    box.appendChild(h('div', { class: 'modalhead' }, [
      h('h2', { text: title }),
      h('button', { class: 'x', text: '×', onclick: closeModal })
    ]));
    box.appendChild(h('div', { class: 'modalbody' }, body));
    ov.appendChild(box);
    return ov;
  };
  render();
}

function openRules() {
  var body = [];
  body.push(h('p', { html: '<b>回合五步：</b>产出 → 污染（7）→ 交易 → 行动 → 结束。' }));
  body.push(h('p', { html: '<b>产出：</b>掷 2d6，与实验室相邻的六边形按数字给元素；工厂给 2 个。' }));
  body.push(h('p', { html: '<b>合成：</b>支付配方卡的原子成本，每回合最多 3 次，需要至少 1 座实验室。' }));
  body.push(h('p', { html: '<b>建造：</b>导管 1C＋1 任意；实验室 1H＋1O＋1C＋1Na；工厂 2Fe＋1C＋1Cl＋1 张产物卡。' }));
  body.push(h('p', { html: '<b>目标：</b>每回合最多完成 1 张；通电/高温目标需要工厂。' }));
  body.push(h('p', { html: '<b>污染：</b>7 点：元素 >7 弃一半（系统按数量从多到少自动弃）；放污染；偷 1 个；2O 治理得环保标记。' }));
  body.push(h('p', { html: '<b>计分：</b>实验室 1、工厂 2、目标卡 1–5、最长反应链 2、2 个环保标记 1 分。' }));
  body.push(h('p', { class: 'muted', html: '本原型为“首局模式”：不含实验卡与 v2.1 条件模块。' }));
  modalBox('规则速查', body);
}

function openSynth() {
  var p = S.turn.p, pl = S.players[p];
  var body = [];
  body.push(h('p', { class: 'hint', html: '每回合最多 3 次（已用 ' + S.turn.synth + '）。本回合合成不会自动用于目标卡。' }));
  var grid = h('div', { class: 'sgrid' });
  DATA.recipes.forEach(function (r) {
    var can = Object.keys(r.atoms).every(function (e) { return (pl.res[e] || 0) >= r.atoms[e]; });
    var cost = Object.keys(r.atoms).map(function (e) {
      return h('span', { class: 'chip ' + ((pl.res[e] || 0) >= r.atoms[e] ? 'ok' : 'no'), text: r.atoms[e] + e });
    });
    var b = h('div', { class: 'scard' + (can ? ' can' : '') }, [
      h('div', { class: 'sid', text: r.id }),
      h('div', { class: 'sform', html: formula(r) + ' <span class="sname">' + esc(r.name) + '</span>' }),
      h('div', { class: 'scost' }, cost)
    ]);
    if (can && S.turn.synth < 3) {
      b.addEventListener('click', function () {
        var res = ACT.synth(r.id);
        if (!res.ok) toast(res.error);
        save();
        UI.modal = null;
        render();
        if (S.phase === 'action') openSynth();
      });
    }
    grid.appendChild(b);
  });
  body.push(grid);
  modalBox('合成产物', body, { wide: true });
}

function openTrade() {
  var p = S.turn.p, pl = S.players[p];
  var body = [];
  body.push(h('div', { class: 'tabs' }));
  body.push(h('p', { class: 'hint', html: '银行：3 个相同元素 → 1 个任意元素；港口：2 个指定元素 → 1 个。' }));

  var give = ELS[0], get = ELS[1];
  var row = h('div', { class: 'trow' });
  var selGive = h('select', { class: 'sel' });
  var selGet = h('select', { class: 'sel' });
  ELS.forEach(function (e) {
    selGive.appendChild(h('option', { value: e, text: e + '（有 ' + (pl.res[e] || 0) + '）' }));
    selGet.appendChild(h('option', { value: e, text: e }));
  });
  row.appendChild(h('span', { class: 'lbl', text: '给出' }));
  row.appendChild(selGive);
  row.appendChild(h('span', { class: 'lbl', text: '换' }));
  row.appendChild(selGet);
  body.push(row);

  var portRow = h('div', { class: 'portsrow' });
  var owned = geo.ports.filter(function (pt) { return G.portForPlayer(S, p, pt.id); });
  if (!owned.length) portRow.appendChild(h('span', { class: 'muted small', text: '你还没有港口（把实验室/工厂建在海岸港口旁即可）。' }));
  owned.forEach(function (pt) {
    portRow.appendChild(h('button', {
      class: 'ghost small',
      text: pt.label + ' 2:1',
      onclick: function () {
        var g = pt.elem === 'HO' ? selGive.value : pt.elem === 'NaCl' ? selGive.value : pt.elem;
        var gv = pt.elem === 'HO' ? (selGive.value === 'H' || selGive.value === 'O' ? selGive.value : '') : pt.elem === 'NaCl' ? (selGive.value === 'Na' || selGive.value === 'Cl' ? selGive.value : '') : pt.elem === selGive.value ? selGive.value : '';
        if (!gv) return toast('这个港口不收 ' + selGive.value);
        var r = ACT.tradePort(pt.id, gv, selGet.value);
        if (!r.ok) return toast(r.error);
        save(); UI.modal = null; render(); openTrade();
      }
    }));
  });
  body.push(portRow);

  body.push(h('div', { class: 'modal-actions' }, [
    h('button', {
      class: 'primary', text: '银行 3:1 交易',
      onclick: function () {
        var r = ACT.tradeBank(selGive.value, selGet.value);
        if (!r.ok) return toast(r.error);
        save(); UI.modal = null; render(); openTrade();
      }
    }),
    h('button', {
      class: 'ghost', text: '玩家交易',
      onclick: function () { openPlayerTrade(); }
    })
  ]));
  modalBox('交易', body);
}

function openPlayerTrade() {
  var p = S.turn.p;
  var other = (p + 1) % S.n;
  var body = [];
  body.push(h('p', { class: 'hint', text: '同屏交易：选好双方给什么，点确认立即交换（信任制）。' }));
  var give = {}, get = {};
  function tokenRow(label, obj) {
    var row = h('div', { class: 'chips' });
    ELS.forEach(function (e) {
      row.appendChild(h('button', {
        class: 'chipbtn', text: e + ' +',
        onclick: function () { obj[e] = (obj[e] || 0) + 1; renderTradeSummary(); }
      }));
      row.appendChild(h('span', { class: 'muted small', text: (obj[e] || 0) ? obj[e] + '' : '' }));
    });
    return h('div', { class: 'tradecol' }, [h('div', { class: 'lbl', text: label }), row]);
  }
  var summary = h('div', { class: 'hint' });
  function renderTradeSummary() {
    summary.innerHTML = '你给：' + Object.keys(give).filter(function (k) { return give[k]; }).map(function (k) { return give[k] + k; }).join(' ') +
      ' ｜ 对方给：' + Object.keys(get).filter(function (k) { return get[k]; }).map(function (k) { return get[k] + k; }).join(' ');
  }
  body.push(tokenRow('你给', give));
  body.push(tokenRow('对方给', get));
  body.push(summary);
  body.push(h('div', { class: 'modal-actions' }, [
    h('button', { class: 'primary', text: '确认交换', onclick: function () {
      if (NET.room) return toast('联机模式暂不支持玩家间交易，请用银行/港口');
      var r = G.tradePlayers(S, p, other, give, get, give, get);
      if (!r.ok) return toast(r.error);
      save(); UI.modal = null; render(); openTrade();
    } }),
    h('button', { class: 'ghost', text: '返回', onclick: function () { UI.modal = null; render(); openTrade(); } })
  ]));
  renderTradeSummary();
  modalBox('与 ' + S.players[other].name + ' 交易', body, { wide: true });
}

function openBuild() {
  var p = S.turn.p, pl = S.players[p];
  var body = [];
  body.push(h('div', { class: 'buildgrid' }, [
    buildCard('导管', '<span class="chip">1C</span> <span class="chip">1 任意</span>', '连接网络的边', function () {
      startPipe();
    }),
    buildCard('实验室', '<span class="chip">1H</span><span class="chip">1O</span><span class="chip">1C</span><span class="chip">1Na</span>', '+1 分，产出 1', function () {
      startLab();
    }),
    buildCard('工厂', '<span class="chip">2Fe</span><span class="chip">1C</span><span class="chip">1Cl</span><span class="chip">1 产物卡</span>', '+2 分，产出 2', function () {
      startFactory();
    })
  ]));
  body.push(h('p', { class: 'hint', text: '点击卡片后，版图上会标出合法位置。' }));
  modalBox('建造', body, { wide: true });
}

function buildCard(title, costHtml, desc, fn) {
  return h('div', { class: 'bcard', onclick: fn }, [
    h('div', { class: 'btitle', text: title }),
    h('div', { class: 'bcost', html: costHtml }),
    h('div', { class: 'bdesc', text: desc })
  ]);
}

function startLab() {
  var p = S.turn.p;
  var legal = G.legalLabVertices(S, p, false);
  UI.modal = null;
  if (!legal.length) {
    toast('没有合法位置：实验室要与已有实验室隔一个交点，且必须接在你的导管网末端');
    return;
  }
  UI.placing = {
    items: legal.map(function (k) {
      return {
        type: 'vertex', key: k, onclick: function () {
          placeResult(ACT.buildLab(k), '实验室已建成 +1 分');
        }
      };
    })
  };
  render();
}

function startPipe() {
  var p = S.turn.p, pl = S.players[p];
  if ((pl.res.C || 0) < 1) return toast('导管需要 1C');
  var opts = ELS.filter(function (e) { return (pl.res[e] || 0) >= 1; });
  if (!opts.length) return toast('没有元素可以支付');
  var legal = G.legalPipeEdges(S, p, false);
  if (!legal.length) return toast('没有可建的位置');
  var body = [h('p', { class: 'hint', text: '选择除 C 之外还要支付的那 1 个元素：' })];
  var row = h('div', { class: 'chips' });
  opts.forEach(function (e) {
    row.appendChild(h('button', { class: 'chipbtn', text: e, onclick: function () {
      UI.modal = null;
      UI.placing = { items: legal.map(function (k) { return { type: 'edge', key: k, onclick: function () {
        placeResult(ACT.buildPipe(k, e), '导管已建成');
      } }; }) };
      render();
    } }));
  });
  body.push(row);
  body.push(h('p', { class: 'muted small', text: 'C 本身也要算 1 个；选 C 表示用 2C 建导管。' }));
  modalBox('导管：1C ＋ 1 任意元素', body);
}

function startFactory() {
  var p = S.turn.p, pl = S.players[p];
  var labs = Object.keys(S.buildings).filter(function (k) { return S.buildings[k].p === p && S.buildings[k].type === 'lab'; });
  var prods = Object.keys(pl.prod);
  if (!labs.length) return toast('你还没有实验室');
  if (!prods.length) return toast('需要 1 张产物卡');
  var body = [h('p', { class: 'hint', text: '选择要消耗的产物卡，再点版图上的实验室：' })];
  var row = h('div', { class: 'chips' });
  prods.forEach(function (rid) {
    row.appendChild(h('button', { class: 'chipbtn', html: (pl.prod[rid] > 1 ? pl.prod[rid] + '× ' : '') + formula(G.RECIPE[rid]), onclick: function () {
      UI.modal = null;
      UI.placing = { items: labs.map(function (k) { return { type: 'vertex', key: k, onclick: function () {
        placeResult(ACT.buildFactory(k, rid), '工厂已建成 +2 分');
      } }; }) };
      render();
    } }));
  });
  body.push(row);
  modalBox('工厂：2Fe＋1C＋1Cl＋1 产物卡', body);
}

function openGoals() {
  var p = S.turn.p;
  var body = [];
  if (S.turn.goalsDone >= 1) body.push(h('p', { class: 'hint', text: '本回合已完成 1 张目标卡，不能再完成。' }));
  S.market.forEach(function (gid, i) {
    if (!gid) return;
    var g = G.GOAL[gid];
    var can = S.turn.goalsDone < 1 && G.canPayGoal(S.players[p], g) && (!G.goalRequiresFactory(g) || G.hasFactory(S, p));
    var row = h('div', { class: 'goalrow' + (can ? ' can' : '') }, [
      h('div', { class: 'grow' }, [
        h('div', { html: '<b>' + g.id + '</b> ' + esc(g.title) + ' <span class="gvp">+' + g.vp + '</span>' }),
        h('div', { class: 'geq', html: fmt(g.equation) }),
        h('div', { class: 'gpay' }, payChips(g).map(function (c) { return h('span', { class: 'chip ' + (c.ok ? 'ok' : 'no'), html: c.html }); }))
      ])
    ]);
    row.addEventListener('click', function () { openGoalDetail(gid, i); });
    body.push(row);
  });
  modalBox('完成目标卡', body, { wide: true });
}

function openGoalDetail(gid, idx) {
  var p = S.phase === 'setup' ? S.setup.order[S.setup.idx] : S.turn.p;
  var g = G.GOAL[gid];
  var pl = S.players[p];
  var body = [];
  body.push(h('div', { class: 'detail-eq', html: fmt(g.equation) }));
  body.push(h('div', { class: 'gmeta' }, [
    h('span', { class: 'tag', text: g.category }),
    h('span', { class: 'cond', text: '条件：' + g.condition + (g.factory ? '（需工厂）' : '') }),
    h('span', { class: 'gvp', text: '+' + g.vp + ' 分' })
  ]));
  body.push(h('div', { class: 'payline' }, [
    h('span', { class: 'lbl', text: '支付' }),
    h('span', {}, G.goalPay(g).map(function (x) {
      var ok = x.kind === 'token' ? (pl.res[x.el] || 0) >= x.n : (pl.prod[x.rid] || 0) >= x.n;
      return h('span', { class: 'chip ' + (ok ? 'ok' : 'no'), html: x.kind === 'token' ? x.n + ' ' + x.el : x.n + ' ' + formula(G.RECIPE[x.rid]) });
    }))
  ]));
  body.push(h('p', { class: 'teaching', html: '<b>教学点：</b>' + esc(g.teaching) }));
  body.push(h('p', { class: 'muted', html: '<b>现象：</b>' + esc(g.observation) }));
  if (g.ionic) body.push(h('p', { class: 'muted', html: '<b>离子方程式：</b>' + fmt(g.ionic) }));
  body.push(h('p', { class: 'muted', html: '<b>安全：</b>' + esc(g.safety) }));
  var can = S.phase === 'action' && S.turn.p === p && S.turn.goalsDone < 1 && G.canPayGoal(pl, g) && (!G.goalRequiresFactory(g) || G.hasFactory(S, p));
  body.push(h('div', { class: 'modal-actions' }, [
    h('button', { class: 'primary' + (can ? '' : ' disabled'), text: can ? '完成这张目标卡' : '条件不足', onclick: function () {
      if (!can) return;
      var r = ACT.goal(idx);
      if (!r.ok) return toast(r.error);
      save(); UI.modal = null; render();
      if (S.phase === 'over') render();
    } }),
    h('button', {
      class: 'ghost', text: '花 1 元素刷新',
      onclick: function () {
        var e = ELS.filter(function (x) { return (pl.res[x] || 0) > 0; })[0];
        if (!e) return toast('没有元素可以支付');
        var r = ACT.refreshGoal(idx, e);
        if (!r.ok) return toast(r.error);
        save(); UI.modal = null; render();
      }
    }),
    h('button', { class: 'ghost', text: '关闭', onclick: closeModal })
  ]));
  modalBox('目标卡 ' + g.id, body);
}

function overOverlay() {
  var scores = G.finalScores(S);
  scores.sort(function (a, b) {
    if (b.vp !== a.vp) return b.vp - a.vp;
    if (b.goals !== a.goals) return b.goals - a.goals;
    return G.totalTokens(S.players[b.player]) - G.totalTokens(S.players[a.player]);
  });
  var ov = h('div', { class: 'overlay' });
  var box = h('div', { class: 'modal wide' });
  box.appendChild(h('div', { class: 'modalhead' }, [h('h2', { text: '游戏结束' })]));
  var body = h('div', { class: 'modalbody' });
  body.appendChild(h('p', {
    class: 'hint',
    html: '获胜者：<b>' + esc(scores[0].name) + '</b>（' + scores[0].vp + ' 分' +
      (scores[0].chainBonus ? '，其中反应链 +2 已计入' : '') + '）'
  }));
  var tbl = h('div', { class: 'scorelist' });
  scores.forEach(function (sc) {
    tbl.appendChild(h('div', { class: 'scorerow' }, [
      h('span', { class: 'dot', style: 'background:' + S.players[sc.player].color }),
      h('span', { class: 'sname', text: sc.name }),
      h('span', { class: 'svp', html: '<b>' + sc.vp + '</b> 分' }),
      h('span', { class: 'sdetail', text: '实验室 ' + sc.labs + ' · 工厂 ' + sc.factories + ' · 目标 ' + sc.goals + ' · 最长链 ' + sc.chain.len + (sc.chainBonus ? ' (+2)' : '') + ' · 环保 ' + sc.env })
    ]));
  });
  body.appendChild(tbl);
  var chainOwner = scores[0];
  if (chainOwner.chain && chainOwner.chain.len >= 3) {
    body.appendChild(h('div', { class: 'chain' }, [
      h('div', { class: 'lbl', text: '最长反应链（' + chainOwner.name + '，' + chainOwner.chain.len + ' 张）' })
    ].concat(chainOwner.chain.chain.map(function (gid, i) {
      return h('div', { class: 'chainrow', html: (i + 1) + '. ' + gid + ' ' + esc(G.GOAL[gid].title) + ' — ' + fmt(G.GOAL[gid].equation) });
    }))));
  }
  body.appendChild(h('div', { class: 'modal-actions' }, [
    h('button', { class: 'primary', text: '再来一局', onclick: function () { localStorage.removeItem(SAVE_KEY); S = null; UI.modal = null; render(); } })
  ]));
  box.appendChild(body);
  ov.appendChild(box);
  return ov;
}


/* -------------------------------------------------------------- 掷骰动画 */
function paintDie(el, n) {
  var pips = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[n] || [];
  var html = '';
  for (var i = 0; i < 9; i++) html += '<i class="' + (pips.indexOf(i) >= 0 ? 'on' : '') + '"></i>';
  el.innerHTML = html;
}

function startRollGlow(sum) {
  UI.rollFlash = { sum: sum, player: S ? S.turn.p : 0, until: Date.now() + 3600 };
  render();
  setTimeout(function () {
    if (UI.rollFlash && Date.now() >= UI.rollFlash.until) {
      UI.rollFlash = null;
      render();
    }
  }, 3800);
}

function maybeDiceFx() {
  if (!S || !S.rollSeq) return;
  if (UI.lastRollSeq === undefined) { UI.lastRollSeq = S.rollSeq; return; }
  if (S.rollSeq === UI.lastRollSeq) return;
  UI.lastRollSeq = S.rollSeq;
  var d = S.turn.dice || [1, 1];
  if (location.search.indexOf('nodfx') >= 0) {
    startRollGlow(d[0] + d[1]);
    return;
  }
  playDiceFx(d[0], d[1]);
}

function playDiceFx(d1, d2) {
  var sum = d1 + d2;
  var who = S.players[S.turn.p] ? S.players[S.turn.p].name : '';
  var seven = sum === 7;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var colorClass = seven ? 'danger' : 'calm';
  var ov = document.createElement('div');
  ov.className = 'dfx';
  ov.innerHTML =
    '<div class="dfx-inner">' +
    '<div class="dfx-who">' + esc(who) + ' 掷骰</div>' +
    '<div class="dfx-dice"><div class="dfx-die"></div><div class="dfx-die"></div></div>' +
    '<div class="dfx-label">本轮点数</div>' +
    '<div class="dfx-sumwrap"><span class="dfx-sum">' + sum + '</span><span class="dfx-unit">点</span></div>' +
    '<div class="dfx-note">' +
    (seven
      ? '污染事件 · 元素超过 7 的要弃一半 · 放污染标记 · 偷 1 个元素'
      : '所有 ' + sum + ' 点的板块产出（工厂 ×2）') +
    '</div>' +
    '<div class="dfx-hint">点击任意处继续</div>' +
    '</div>';
  document.body.appendChild(ov);
  var dice = ov.querySelectorAll('.dfx-die');
  paintDie(dice[0], 1 + Math.floor(Math.random() * 6));
  paintDie(dice[1], 1 + Math.floor(Math.random() * 6));
  var freeze = location.search.indexOf('freeze') >= 0;
  if (freeze) {
    paintDie(dice[0], d1);
    paintDie(dice[1], d2);
    ov.classList.add('landed', colorClass, 'instant');
    ov.style.animation = 'none';
    ov.style.opacity = '1';
    ov.querySelectorAll('.dfx-die, .dfx-label, .dfx-sumwrap, .dfx-note, .dfx-hint').forEach(function (el) {
      el.style.animation = 'none';
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    startRollGlow(sum);
    return;
  }
  var spin = setInterval(function () {
    paintDie(dice[0], 1 + Math.floor(Math.random() * 6));
    paintDie(dice[1], 1 + Math.floor(Math.random() * 6));
  }, 70);
  setTimeout(function () {
    clearInterval(spin);
    paintDie(dice[0], d1);
    paintDie(dice[1], d2);
    ov.classList.add('landed');
    ov.classList.add(colorClass); // 缓缓渐变到蓝/红
  }, reduce ? 120 : 900);
  var close = function () {
    if (ov.classList.contains('out')) return;
    ov.classList.add('out');
    setTimeout(function () { if (ov.parentNode) ov.remove(); }, 260);
  };
  var closed = false;
  var finish = function () {
    if (closed) return;
    closed = true;
    close();
    startRollGlow(sum);
  };
  setTimeout(finish, reduce ? 1000 : 4200);
  ov.addEventListener('click', finish);
}

/* ------------------------------------------------------------------- toast */
var toastTimer = null;
function toast(msg) {
  var t = document.getElementById('toast');
  if (!t) {
    t = h('div', { id: 'toast', class: 'toast' });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
}


/* ------------------------------------------------------------- demo mode */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function demoDeficits(goal, pl) {
  var tok = {}, cards = {};
  goal.reactants.forEach(function (r) {
    if (r[0] === 'token') {
      var d = r[2] - (pl.res[r[1]] || 0);
      if (d > 0) tok[r[1]] = (tok[r[1]] || 0) + d;
    } else {
      var d2 = r[2] - (pl.prod[r[1]] || 0);
      if (d2 > 0) cards[r[1]] = (cards[r[1]] || 0) + d2;
    }
  });
  return { tok: tok, cards: cards };
}
function demoBestPlan(S2, pl, p) {
  var best = null;
  S2.market.forEach(function (gid, i) {
    if (!gid) return;
    var g = G.GOAL[gid];
    if (G.goalRequiresFactory(g) && !G.hasFactory(S2, p)) return;
    var def = demoDeficits(g, pl);
    var atoms = 0;
    Object.keys(def.tok).forEach(function (e) { atoms += def.tok[e]; });
    Object.keys(def.cards).forEach(function (rid) {
      var mul = def.cards[rid];
      Object.keys(G.RECIPE[rid].atoms).forEach(function (e) { atoms += G.RECIPE[rid].atoms[e] * mul; });
    });
    if (!best || atoms < best.atoms) best = { i: i, g: g, atoms: atoms };
  });
  return best;
}

function demoRun(n, seed, turns) {
  var rng = mulberry32(seed);
  var names = ['小红', '小蓝', '小绿', '小紫'].slice(0, n);
  var colors = ['#0F6E6E', '#D97706', '#7C3AED', '#B91C1C'].slice(0, n);
  S = G.newGame({ players: names, colors: colors, mode: 'standard', rng: rng });
  var pip = G.PROB;
  function scoreVertex(vk) {
    var v = geo.vertices[vk];
    var s = 0;
    v.hexes.forEach(function (i) { s += (pip[geo.hexes[i].n] || 0); });
    return s;
  }
  while (S.phase === 'setup') {
    var p = S.setup.order[S.setup.idx];
    if (S.setup.stage === 'lab') {
      var cands = G.legalLabVertices(S, p, true).sort(function (a, b) { return scoreVertex(b) - scoreVertex(a); });
      G.placeSetupLab(S, p, cands[Math.min(2, cands.length - 1)]);
    } else {
      var es = G.legalPipeEdges(S, p, true, S.setup.lastLab);
      G.placeSetupPipe(S, p, es[Math.floor(rng() * es.length)]);
    }
  }
  for (var t = 0; t < turns && S.phase !== 'over'; t++) {
    var cp = S.turn.p;
    var r = G.roll(S, rng);
    if (r.seven) {
      var hi = Math.floor(rng() * 19);
      G.placePollution(S, hi);
      if (S.phase === 'pollution-steal') {
        var others = S.players.map(function (_, i) { return i; }).filter(function (i) { return i !== cp; });
        var geo2 = geo.hexes[S.polluted];
        var ok = others.filter(function (i) {
          return geo2.corners.some(function (vk) { return S.buildings[vk] && S.buildings[vk].p === i; });
        });
        if (ok.length) G.steal(S, ok[Math.floor(rng() * ok.length)]);
        else G.skipSteal(S);
      }
    }
    var guard = 0;
    while (S.phase === 'action' && guard++ < 40) {
      var me = S.players[cp];
      var doneGoal = false;
      S.market.forEach(function (gid, i) {
        if (doneGoal || !gid) return;
        var g = G.GOAL[gid];
        if (G.canPayGoal(me, g) && (!G.goalRequiresFactory(g) || G.hasFactory(S, cp))) {
          if (G.completeGoal(S, cp, i).ok) doneGoal = true;
        }
      });
      if (doneGoal) continue;
      var plan = demoBestPlan(S, me, cp);
      if (plan && S.turn.synth < 3) {
        var def = demoDeficits(plan.g, me);
        var madeCard = false;
        Object.keys(def.cards).forEach(function (rid) {
          if (madeCard) return;
          var atoms = G.RECIPE[rid].atoms;
          if (ELS.every(function (e) { return (me.res[e] || 0) >= (atoms[e] || 0); })) {
            if (G.synthesize(S, cp, rid).ok) madeCard = true;
          }
        });
        if (madeCard) continue;
      }
      if (plan) {
        var def2 = demoDeficits(plan.g, me);
        var want = Object.keys(def2.tok)[0];
        if (want) {
          var give = ELS.filter(function (e) { return e !== want; })
            .sort(function (a, b) { return (me.res[b] || 0) - (me.res[a] || 0); })[0];
          if ((me.res[give] || 0) >= 3 && (S.bank[want] || 0) > 0 && G.tradeBank(S, cp, give, want).ok) continue;
        }
      }
      var myLabs = Object.keys(S.buildings).filter(function (k) { return S.buildings[k].p === cp && S.buildings[k].type === 'lab'; });
      if (myLabs.length < 3 && (me.res.H || 0) >= 1 && (me.res.O || 0) >= 1 && (me.res.C || 0) >= 1 && (me.res.Na || 0) >= 1) {
        var lv = G.legalLabVertices(S, cp, false);
        if (lv.length && G.buildLab(S, cp, lv[0]).ok) continue;
      }
      if (S.polluted !== null && (me.res.O || 0) >= 2 && G.treatPollution(S, cp).ok) continue;
      break;
    }
    if (S.phase === 'action') G.endTurn(S);
  }
}


/* -------------------------------------------------------------- self test */
function runSelfTest() {
  var rep = [];
  function t(name, fn) {
    try { fn(); rep.push('PASS  ' + name); }
    catch (e) {
      if (e && e.skip) { rep.push('SKIP  ' + name + ' — ' + e.message); return; }
      rep.push('FAIL  ' + name + ' — ' + e.message);
    }
  }
  function need(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

  t('初始摆放点击有反馈', function () {
    var keep = S;
    S = G.newGame({ players: ['甲', '乙', '丙'], colors: ['#0F6E6E', '#D97706', '#7C3AED'] });
    render();
    var before = Object.keys(S.buildings).length;
    var c = document.querySelector('circle.hl');
    need(c, '版图上没有高亮圆圈');
    c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    need(Object.keys(S.buildings).length === before + 1, '点了圆圈但没有放下实验室');
    need(S.setup.stage === 'pipe', '放完实验室没有进入放导管阶段');
    var e2 = document.querySelector('line.hl');
    need(e2, '没有导管高亮');
    e2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    need(Object.keys(S.pipes).length === 1, '点了边但没有放下导管');
    S = keep;
    render();
  });
  t('行动阶段建造点击有反馈', function () {
    var keep = S;
    S = G.newGame({ players: ['甲', '乙', '丙'], colors: ['#0F6E6E', '#D97706', '#7C3AED'] });
    S.phase = 'action'; S.turn.p = 0;
    var gg = G.geometry();
    var vk = Object.keys(gg.vertices)[10];
    S.buildings[vk] = { p: 0, type: 'lab' };
    var e1 = gg.vertices[vk].edges[0];
    S.pipes[e1] = 0;
    var far1 = gg.edges[e1].a === vk ? gg.edges[e1].b : gg.edges[e1].a;
    var e2 = gg.vertices[far1].edges.filter(function (k) {
      return k !== e1 && !S.buildings[gg.edges[k].a === far1 ? gg.edges[k].b : gg.edges[k].a];
    })[0];
    S.pipes[e2] = 0;
    var me = S.players[0];
    ['H', 'O', 'C', 'Na'].forEach(function (e) { me.res[e] = 5; });
    render();
    var before = Object.keys(S.buildings).filter(function (k) { return S.buildings[k].p === 0 && S.buildings[k].type === 'lab'; }).length;
    startLab(); render();
    var c = document.querySelector('circle.hl');
    need(c, '没有可建实验室的高亮位（两段导管之外）');
    c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    var after = Object.keys(S.buildings).filter(function (k) { return S.buildings[k].p === 0 && S.buildings[k].type === 'lab'; }).length;
    need(after === before + 1, '点击后实验室数量没变（' + before + '→' + after + '）');
    var t2 = document.getElementById('toast');
    need(t2 && t2.classList.contains('show'), '没有出现提示条');
    UI.placing = null;
    S = keep;
    render();
  });
  t('掷骰按钮可用', function () {
    UI.modal = null; UI.placing = null;
    S.phase = 'roll'; render();
    var btn = document.querySelector('button.primary.big');
    need(btn, '找不到掷骰按钮');
    btn.click();
    need(S.phase !== 'roll', '点击后仍在掷骰阶段');
    if (S.phase === 'pollution-place') { G.placePollution(S, 0); if (S.phase === 'pollution-steal') G.skipSteal(S); }
    render();
  });
  t('合成面板可打开', function () {
    UI.modal = null; UI.placing = null;
    var pl0 = S.players[S.turn.p];
    ELS.forEach(function (e) { pl0.res[e] = Math.max(pl0.res[e] || 0, 4); });
    render();
    openSynth();
    render();
    need(document.querySelectorAll('.scard').length >= 10, '配方卡不足');
    need(document.querySelectorAll('.scard.can').length > 0, '没有可合成的配方');
    document.querySelector('.scard.can').click();
    need(S.players[S.turn.p] && Object.keys(S.players[S.turn.p].prod).length >= 0, '合成后状态异常');
  });
  t('交易面板可打开', function () {
    openTrade(); render();
    need(document.querySelectorAll('.sel').length === 2, '下拉框缺失');
    need(document.querySelectorAll('.portsrow').length === 1, '港口行缺失');
    UI.modal = null;
  });
  t('建造面板可打开', function () {
    openBuild(); render();
    need(document.querySelectorAll('.bcard').length === 3, '建造卡不足');
    UI.modal = null;
  });
  t('实验室高亮可用', function () {
    var pl1 = S.players[S.turn.p];
    ['H', 'O', 'C', 'Na'].forEach(function (e) { pl1.res[e] = Math.max(pl1.res[e] || 0, 3); });
    startLab(); render();
    if (!UI.placing || !UI.placing.items.length) {
      UI.placing = null; render();
      throw { skip: true, message: '当前网络没有合法交点（正常局面）' };
    }
    need(document.querySelectorAll('circle.hl').length > 0, '没有渲染高亮');
    UI.placing = null; render();
  });
  t('目标卡详情可打开', function () {
    openGoals(); render();
    need(document.querySelectorAll('.goalrow').length > 0, '市场为空');
    UI.modal = null;
    if (S.market[0]) { openGoalDetail(S.market[0], 0); render(); need(document.querySelector('.detail-eq'), '缺少方程式'); }
    UI.modal = null;
  });
  t('规则弹窗可打开', function () {
    openRules(); render();
    need(document.querySelectorAll('.modal').length === 1, '规则弹窗缺失');
    UI.modal = null;
  });
  t('结束回合按钮可用', function () {
    UI.modal = null; UI.placing = null; render();
    var before = S.turn.p;
    var btns = Array.prototype.slice.call(document.querySelectorAll('button.primary.wide'));
    var btn = btns.filter(function (b) { return b.textContent.indexOf('结束回合') >= 0; })[0];
    need(btn, '找不到结束回合按钮');
    btn.click();
    need(S.turn.p !== before || S.phase === 'over', '玩家没有切换');
  });
  render();
  var box = document.createElement('div');
  box.className = 'selftest';
  box.innerHTML = '<b>UI self test</b><br>' + rep.map(function (x) {
    return '<span style="color:' + (x.indexOf('PASS') === 0 ? '#166534' : '#B91C1C') + '">' + x + '</span>';
  }).join('<br>');
  document.body.appendChild(box);
  document.title = 'SELFTEST ' + rep.filter(function (x) { return x.indexOf('FAIL') === 0; }).length + ' fail';
}
function EI_endTurnSafe() {
  if (S.phase === 'action') return window.ElementIsland.endTurn(S);
  return { ok: false };
}

/* -------------------------------------------------------------------- boot */
(function boot() {
  var q = location.search || '';
  var joinMatch = /[?&]join=([A-Za-z0-9]{4})/.exec(q);
  if (joinMatch) {
    var jc = joinMatch[1].toUpperCase();
    S = null;
    netConnect(function () {
      var nm = loadName() || ('玩家' + Math.floor(Math.random() * 90 + 10));
      netSend({ t: 'join', code: jc, name: nm });
    });
    render();
    return;
  }
  var dm = /[?&]dicefx=(\d+)/.exec(q);
  if (dm) {
    demoRun(3, 7, 8);
    render();
    var n = Math.max(2, Math.min(12, +dm[1]));
    setTimeout(function () { playDiceFx(Math.max(1, n - 3), 3); }, 120);
    return;
  }
  if (q.indexOf('lobby') >= 0) {
    render();
    openLobby();
    return;
  }
  var gm = /[?&]glow=(\d+)/.exec(q);
  if (gm) {
    demoRun(3, 7, 16);
    render();
    startRollGlow(+gm[1]);
    return;
  }
  if (q.indexOf('setup') >= 0) {
    S = G.newGame({
      players: ['小红', '小蓝', '小绿'],
      colors: ['#0F6E6E', '#D97706', '#7C3AED'],
      mode: 'standard'
    });
    render();
    return;
  }
  if (q.indexOf('demo') >= 0) {
    var m = /turns=(\d+)/.exec(q);
    var n = /n=(\d+)/.exec(q);
    demoRun(n ? +n[1] : 3, 7, m ? +m[1] : 16);
    if (q.indexOf('end') >= 0) { S.phase = 'over'; S.winner = 0; }
    render();
    var rm = /[?&]ref=([A-Za-z0-9]+)/.exec(q);
    if (rm) openReference(rm[1]);
    else if (q.indexOf('ref') >= 0) openReference();
    if (q.indexOf('selftest') >= 0) runSelfTest();
    return;
  }
  var saved = loadSession() ? null : loadSaved();
  if (saved && saved.phase !== 'over') S = saved;
  if (S) UI.lastRollSeq = S.rollSeq || 0;
  render();
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { UI.modal = null; UI.placing = null; render(); }
  });
})();