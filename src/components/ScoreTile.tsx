import { useEffect, useState } from "react";

export function ScoreTile({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string | number;
  tone?: string;
  detail?: string;
}) {
  const numericValue = typeof value === "number" ? value : null;
  const [displayValue, setDisplayValue] = useState(numericValue ?? value);

  useEffect(() => {
    if (numericValue === null) {
      setDisplayValue(value);
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setDisplayValue(numericValue);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const duration = 940;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.round(numericValue * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [numericValue, value]);

  return (
    <section className={`score-tile ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{displayValue}</strong>
      {detail ? <small>{detail}</small> : null}
    </section>
  );
}
