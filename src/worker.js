// Cloudflare Worker: static assets + WebSocket rooms (Durable Object).
import EI from "../public/game.js";

const COLORS = ["#0F6E6E", "#D97706", "#7C3AED", "#B91C1C"];
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(rooms) {
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  } while (rooms.has(code));
  return code;
}

// 客户端只需要牌堆数量，不需要顺序
function stateView(state) {
  const v = { ...state };
  v.goalDeckCount = Array.isArray(state.goalDeck) ? state.goalDeck.length : 0;
  delete v.goalDeck;
  return v;
}

const ACTIONS = {
  roll: (s) => EI.roll(s),
  setupLab: (s, p, a) => EI.placeSetupLab(s, p, a.vertex),
  setupPipe: (s, p, a) => EI.placeSetupPipe(s, p, a.edge),
  placePollution: (s, p, a) => EI.placePollution(s, a.hex),
  steal: (s, p, a) => EI.steal(s, a.victim),
  skipSteal: (s) => EI.skipSteal(s),
  synth: (s, p, a) => EI.synthesize(s, p, a.rid),
  buildPipe: (s, p, a) => EI.buildPipe(s, p, a.edge, a.any),
  buildLab: (s, p, a) => EI.buildLab(s, p, a.vertex),
  buildFactory: (s, p, a) => EI.buildFactory(s, p, a.vertex, a.rid),
  goal: (s, p, a) => EI.completeGoal(s, p, a.index),
  refreshGoal: (s, p, a) => EI.refreshMarketWith(s, p, a.index, a.elem),
  treat: (s, p) => EI.treatPollution(s, p),
  tradeBank: (s, p, a) => EI.tradeBank(s, p, a.give, a.get),
  tradePort: (s, p, a) => EI.tradePort(s, p, a.port, a.give, a.get),
  endTurn: (s) => EI.endTurn(s)
};

export class Rooms {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rooms = new Map();      // code -> room
    this.sessions = new Map();   // ws -> { id, roomCode }
  }

  async fetch(request) {
    const upgrade = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgrade !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const id = crypto.randomUUID();
    this.sessions.set(server, { id, roomCode: null });
    this.send(server, { t: "welcome", id });

    server.addEventListener("message", (ev) => this.onMessage(server, ev.data));
    server.addEventListener("close", () => this.onClose(server));
    server.addEventListener("error", () => this.onClose(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      /* closed */
    }
  }

  broadcast(room, obj) {
    room.players.forEach((p) => p.ws && this.send(p.ws, obj));
  }

  roomView(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      started: room.started,
      mode: room.mode,
      players: room.players.map((p) => ({
        id: p.id, name: p.name, connected: p.connected, seat: p.seat
      }))
    };
  }

  broadcastRoom(room) {
    const view = this.roomView(room);
    room.players.forEach((p) => p.ws && this.send(p.ws, { t: "room", room: view, you: p.id }));
  }

  broadcastState(room) {
    const view = stateView(room.state);
    room.players.forEach((p) => p.ws && this.send(p.ws, { t: "state", state: view, you: p.seat }));
  }

  onMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch (e) {
      return this.send(ws, { t: "error", message: "消息格式错误" });
    }
    if (!msg || typeof msg.t !== "string") return;

    const sess = this.sessions.get(ws);
    if (!sess) return;

    if (msg.t === "create") {
      const name = String(msg.name || "玩家").slice(0, 10) || "玩家";
      const mode = msg.mode === "short" ? "short" : "standard";
      const code = makeCode(this.rooms);
      const room = {
        code, hostId: sess.id, started: false, mode, state: null, players: [], createdAt: Date.now()
      };
      this.rooms.set(code, room);
      this.joinRoom(room, ws, name);
      return;
    }

    if (msg.t === "join") {
      const code = String(msg.code || "").trim().toUpperCase();
      const room = this.rooms.get(code);
      if (!room) return this.send(ws, { t: "error", message: "房间不存在：" + code });
      if (room.started) return this.send(ws, { t: "error", message: "这局已经开始，等下一局吧" });
      if (room.players.length >= 4) return this.send(ws, { t: "error", message: "房间已满（4 人）" });
      const name = String(msg.name || "玩家").slice(0, 10) || "玩家";
      this.joinRoom(room, ws, name);
      return;
    }

    if (msg.t === "rejoin") {
      const code = String(msg.code || "").trim().toUpperCase();
      const room = this.rooms.get(code);
      if (!room) return this.send(ws, { t: "left", reason: "房间已关闭" });
      const seat = room.players.find((p) => p.id === msg.id);
      if (!seat) return this.send(ws, { t: "left", reason: "找不到你的座位" });
      seat.ws = ws;
      seat.connected = true;
      sess.id = seat.id;
      sess.roomCode = room.code;
      this.broadcastRoom(room);
      if (room.state) this.send(ws, { t: "state", state: stateView(room.state), you: seat.seat });
      return;
    }

    const room = this.rooms.get(sess.roomCode);
    if (!room) return this.send(ws, { t: "error", message: "你不在房间里" });
    const me = room.players.find((p) => p.id === sess.id);

    if (msg.t === "start") {
      if (sess.id !== room.hostId) return this.send(ws, { t: "error", message: "只有房主能开始" });
      if (room.started) return this.send(ws, { t: "error", message: "已经开始了" });
      if (room.players.length < 2) return this.send(ws, { t: "error", message: "至少 2 人才能开始" });
      room.state = EI.newGame({
        players: room.players.map((p) => p.name),
        colors: room.players.map((p) => COLORS[p.seat]),
        mode: room.mode
      });
      room.started = true;
      this.broadcastRoom(room);
      this.broadcastState(room);
      return;
    }

    if (msg.t === "action") {
      if (!me) return;
      if (!room.started) return this.send(ws, { t: "error", message: "游戏还没开始" });
      const fn = ACTIONS[msg.name];
      if (!fn) return this.send(ws, { t: "error", message: "未知操作：" + msg.name });
      let result;
      try {
        result = fn(room.state, me.seat, msg.args || {});
      } catch (e) {
        return this.send(ws, { t: "error", message: "操作异常：" + e.message });
      }
      if (!result || result.ok === false) {
        return this.send(ws, { t: "error", message: (result && result.error) || "操作不合法" });
      }
      this.broadcastState(room);
      return;
    }

    if (msg.t === "leave") {
      this.leaveRoom(ws, room);
    }
  }

  joinRoom(room, ws, name) {
    const used = room.players.map((p) => p.seat);
    let seat = 0;
    while (used.includes(seat)) seat++;
    const player = { id: this.sessions.get(ws).id, name, seat, connected: true, ws };
    room.players.push(player);
    this.sessions.get(ws).roomCode = room.code;
    this.broadcastRoom(room);
    if (room.state) this.send(ws, { t: "state", state: stateView(room.state), you: seat });
  }

  leaveRoom(ws, room) {
    const sess = this.sessions.get(ws);
    const idx = room.players.findIndex((p) => p.id === sess.id);
    if (idx < 0) return;
    sess.roomCode = null;
    if (room.started) {
      room.players[idx].connected = false;
      room.players[idx].ws = null;
      this.broadcastRoom(room);
      return;
    }
    room.players.splice(idx, 1);
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === sess.id) room.hostId = room.players[0].id;
    room.players.forEach((p, i) => (p.seat = i));
    this.broadcastRoom(room);
  }

  onClose(ws) {
    const sess = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (!sess || !sess.roomCode) return;
    const room = this.rooms.get(sess.roomCode);
    if (!room) return;
    const me = room.players.find((p) => p.id === sess.id);
    if (!me) return;
    me.connected = false;
    me.ws = null;
    this.broadcastRoom(room);
    if (room.players.every((p) => !p.connected)) {
      // 留 10 分钟给重连；下一次创建房间时不会冲突
      room.emptyAt = Date.now();
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const id = env.ROOMS.idFromName("lobby");
      return env.ROOMS.get(id).fetch(request);
    }
    if (url.pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }
    return env.ASSETS.fetch(request);
  }
};
