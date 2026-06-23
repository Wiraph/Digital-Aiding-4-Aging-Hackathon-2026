import type { CSSProperties } from "react";
import type { TrialPrompt } from "../types";
import { ZONES, getZone, sideLabel } from "../lib/assessment";

interface ZoneGridProps {
  prompt?: TrialPrompt;
  highlight?: number;
  compact?: boolean;
}

export function ZoneGrid({ prompt, highlight = 0, compact = false }: ZoneGridProps) {
  const targetZone = prompt ? getZone(prompt.zoneId) : undefined;

  return (
    <div className={`zone-grid ${compact ? "zone-grid--compact" : ""}`}>
      {ZONES.map((zone) => {
        const isTarget = targetZone?.id === zone.id;
        const side = prompt?.side ?? "free";
        const heat = 0.25 + Math.min(0.7, highlight);

        return (
          <div
            className={`zone-cell zone-cell--${side} ${isTarget ? "is-target" : ""}`}
            key={zone.id}
            style={isTarget ? ({ "--target-heat": String(heat) } as CSSProperties) : undefined}
          >
            <span className="zone-number">{zone.id}</span>
            {isTarget ? (
              <b className="zone-side-label max-[700px]:hidden">
                {sideLabel(side)}
              </b>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
