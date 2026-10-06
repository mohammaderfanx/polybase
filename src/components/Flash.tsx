import { useEffect, useRef, useState } from "react";

/** Flashes green/red when the numeric value ticks up/down. */
export function Flash({ value, children, className = "" }: { value: number | null | undefined; children: React.ReactNode; className?: string }) {
  const prev = useRef(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (value != null && prev.current != null && value !== prev.current) {
      setDir(value > prev.current ? "up" : "down");
      const t = setTimeout(() => setDir(null), 600);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
    return undefined;
  }, [value]);
  return <span className={`${dir === "up" ? "flash-up" : dir === "down" ? "flash-down" : ""} rounded-sm px-0.5 ${className}`}>{children}</span>;
}
