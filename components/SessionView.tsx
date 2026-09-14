"use client";

import { useState } from "react";
import SessionChart from "./SessionChart";
import EventTimeline from "./EventTimeline";
import type { SeriesPoint, SessionEvent } from "@/lib/types";

export default function SessionView({
  series,
  events,
}: {
  series: SeriesPoint[];
  events: SessionEvent[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <SessionChart
        series={series}
        events={events}
        focusEventId={selectedId}
        onClear={() => setSelectedId(null)}
      />
      <EventTimeline events={events} selectedId={selectedId} onSelect={setSelectedId} />
    </div>
  );
}
