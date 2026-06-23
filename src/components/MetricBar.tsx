interface MetricBarProps {
  label: string;
  value: number;
  tone?: "neutral" | "left" | "right" | "risk";
}

export function MetricBar({ label, value, tone = "neutral" }: MetricBarProps) {
  return (
    <div className={`metric-bar metric-bar--${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-extrabold">{label}</span>
        <strong className="text-base">{Math.round(value)}</strong>
      </div>
      <progress
        max={100}
        value={Math.max(0, Math.min(100, value))}
      />
    </div>
  );
}
