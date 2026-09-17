import type {
  GoalSeriesPoint,
  SessionData,
  SessionDay,
  SessionEvent,
  SessionListEntry,
  SeriesPoint,
  SessionSymbol,
} from "./types";
import { TICK_SIZE } from "./types";

// PRNG determinista (mulberry32): mismos datos de ejemplo en cada carga para
// una fecha+símbolo dados, en vez de aleatorio distinto cada vez.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

const GOAL_KEYS = ["classicMajorPosVol", "classicMajorNegVol", "goalCall", "goalPut"];

const SYMBOL_BASE_PRICE: Record<SessionSymbol, number> = { NQ: 19850, ES: 5620 };

function businessDays(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1); // sesión de "hoy" puede seguir abierta: empezar en ayer
  while (out.length < count) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

export function mockSessionList(): SessionListEntry[] {
  const dates = businessDays(5);
  const out: SessionListEntry[] = [];
  for (const symbol of ["NQ", "ES"] as SessionSymbol[]) {
    for (const session_date of dates) {
      out.push({ symbol, session_date, status: "closed" });
    }
  }
  return out;
}

export function mockSessionData(symbol: SessionSymbol, sessionDate: string): SessionData {
  const rand = mulberry32(hashSeed(`${symbol}|${sessionDate}`));
  const basePrice = SYMBOL_BASE_PRICE[symbol];
  const tick = TICK_SIZE[symbol];

  const openedAt = new Date(`${sessionDate}T13:30:00.000Z`);
  const closedAt = new Date(`${sessionDate}T20:00:00.000Z`);
  const totalSeconds = (closedAt.getTime() - openedAt.getTime()) / 1000;

  const session: SessionDay = {
    id: hashSeed(`${symbol}|${sessionDate}`),
    symbol,
    session_date: sessionDate,
    opened_at: openedAt.toISOString(),
    closed_at: closedAt.toISOString(),
    status: "closed",
  };

  // Serie: precio en paseo aleatorio, netgex oscilando despacio, z con reversion
  // a la media y algún tramo de saturación real.
  const series: SeriesPoint[] = [];
  let price = basePrice + (rand() - 0.5) * 40;
  let z = 0;
  const stepSeconds = 15;
  const trendBias = (rand() - 0.5) * 0.03; // sesiones ligeramente alcistas/bajistas
  for (let t = 0; t <= totalSeconds; t += stepSeconds) {
    price += (rand() - 0.5) * tick * 6 + trendBias;
    z = z * 0.985 + (rand() - 0.5) * 0.35;
    if (rand() < 0.004) z += (rand() < 0.5 ? -1 : 1) * (2 + rand() * 1.5); // saturaciones ocasionales
    const netgex = Math.sin(t / 2400 + hashSeed(sessionDate) % 10) * 8000 + (rand() - 0.5) * 1500;
    series.push({
      ts: new Date(openedAt.getTime() + t * 1000).toISOString(),
      price: Math.round(price / tick) * tick,
      netgex: Math.round(netgex),
      z: Number(z.toFixed(3)),
    });
  }

  // Trayectoria de cada goal: unos pocos saltos de strike a lo largo de la
  // sesión (función escalón, igual que graba el backend real). goalStrikes
  // se queda con el ÚLTIMO strike de cada goal, para los toques de abajo.
  const goalSeries: GoalSeriesPoint[] = [];
  const goalStrikes = new Map<string, number>();
  for (const k of GOAL_KEYS) {
    let strike = Math.round((basePrice + (rand() - 0.5) * 200) / (tick * 20)) * tick * 20;
    goalSeries.push({ ts: openedAt.toISOString(), goal: k, strike, volume: Number((300 + rand() * 2000).toFixed(1)) });
    const jumps = Math.floor(rand() * 3); // 0-2 saltos extra
    for (let i = 0; i < jumps; i++) {
      const t = Math.floor((rand() * 0.8 + 0.1) * totalSeconds);
      strike += (rand() < 0.5 ? -1 : 1) * tick * 20 * (1 + Math.floor(rand() * 3));
      goalSeries.push({
        ts: new Date(openedAt.getTime() + t * 1000).toISOString(),
        goal: k,
        strike,
        volume: Number((300 + rand() * 2000).toFixed(1)),
      });
    }
    goalStrikes.set(k, strike);
  }
  goalSeries.sort((a, b) => a.ts.localeCompare(b.ts));

  // Eventos: goal touches, saturaciones armado/disparo emparejadas, migraciones.
  const events: SessionEvent[] = [];
  let eventId = 1;

  const touchCount = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < touchCount; i++) {
    const t = Math.floor(rand() * totalSeconds);
    const goal = GOAL_KEYS[Math.floor(rand() * GOAL_KEYS.length)];
    events.push({
      id: eventId++,
      ts: new Date(openedAt.getTime() + t * 1000).toISOString(),
      type: "goal_touch",
      payload: {
        goal,
        strike: goalStrikes.get(goal)!,
        price: goalStrikes.get(goal)! + (rand() - 0.5) * tick * 2,
        volume: Number((200 + rand() * 3000).toFixed(1)),
        timeAtStrikeSeconds: Math.floor(60 + rand() * 5400),
      },
    });
  }

  const satPairs = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < satPairs; i++) {
    const armT = Math.floor(rand() * (totalSeconds - 600));
    const direction = rand() < 0.5 ? "buy" : "sell";
    const zAtArm = direction === "buy" ? -(2.5 + rand() * 0.8) : 2.5 + rand() * 0.8;
    events.push({
      id: eventId++,
      ts: new Date(openedAt.getTime() + armT * 1000).toISOString(),
      type: "saturation_armed",
      payload: { direction, z: Number(zAtArm.toFixed(2)) },
    });
    const fireT = armT + 30 + Math.floor(rand() * 500);
    events.push({
      id: eventId++,
      ts: new Date(openedAt.getTime() + Math.min(fireT, totalSeconds - 1) * 1000).toISOString(),
      type: "saturation_signal",
      payload: { direction, z: Number((zAtArm * 0.5).toFixed(2)) },
    });
  }

  const migCount = Math.floor(rand() * 3);
  for (let i = 0; i < migCount; i++) {
    const t = Math.floor(rand() * totalSeconds);
    const shuffled = [...GOAL_KEYS].sort(() => rand() - 0.5);
    events.push({
      id: eventId++,
      ts: new Date(openedAt.getTime() + t * 1000).toISOString(),
      type: "goal_migration",
      payload: {
        from: shuffled[0],
        to: shuffled[1],
        dropAbs: Number((300 + rand() * 1200).toFixed(1)),
        riseAbs: Number((300 + rand() * 1200).toFixed(1)),
      },
    });
  }

  events.sort((a, b) => a.ts.localeCompare(b.ts));

  return { session, series, events, goalSeries, mode: "mock" };
}
