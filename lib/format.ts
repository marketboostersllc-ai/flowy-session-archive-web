import { GOAL_LABELS, type SessionEvent } from "./types";

const timeFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatEtTime(iso: string): string {
  return `${timeFmt.format(new Date(iso))} NY`;
}

function minutesSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  if (m === 0) return `${s}s`;
  return `${m} min${s ? ` ${s}s` : ""}`;
}

export function describeEvent(ev: SessionEvent): string {
  switch (ev.type) {
    case "goal_touch": {
      const p = ev.payload as { goal: string; strike: number; volume: number; timeAtStrikeSeconds: number };
      const goal = GOAL_LABELS[p.goal] ?? p.goal;
      return `Toque de ${goal} @ ${p.strike} — volumen ${p.volume.toFixed(0)}, llevaba ${minutesSeconds(
        p.timeAtStrikeSeconds
      )} en ese strike`;
    }
    case "saturation_armed": {
      const p = ev.payload as { direction: "buy" | "sell"; z: number };
      return `Oscilador satura hacia ${p.direction === "buy" ? "abajo" : "arriba"} (z=${p.z.toFixed(2)})`;
    }
    case "saturation_signal": {
      const p = ev.payload as { direction: "buy" | "sell"; z: number };
      return `Señal de reversión: ${p.direction === "buy" ? "COMPRA" : "VENTA"} (vuelve a cruzar, z=${p.z.toFixed(2)})`;
    }
    case "goal_migration": {
      const p = ev.payload as { from: string; to: string; dropAbs: number; riseAbs: number };
      return `Migración de volumen: ${GOAL_LABELS[p.from] ?? p.from} → ${GOAL_LABELS[p.to] ?? p.to} — ${p.dropAbs.toFixed(
        0
      )} / ${p.riseAbs.toFixed(0)}`;
    }
    default:
      return ev.type;
  }
}

export function eventAccent(ev: SessionEvent): string {
  switch (ev.type) {
    case "goal_touch":
      return "text-purple";
    case "saturation_armed":
      return "text-amber";
    case "saturation_signal": {
      const p = ev.payload as { direction: "buy" | "sell" };
      return p.direction === "buy" ? "text-volt" : "text-press";
    }
    case "goal_migration":
      return "text-amber";
    default:
      return "text-text-dim";
  }
}
