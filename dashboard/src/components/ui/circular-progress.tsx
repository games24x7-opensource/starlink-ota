import * as React from "react";
import { cn } from "../../lib/utils";

interface CircularProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
}

export function CircularProgress({
  value,
  max = 100,
  className,
  ...props
}: CircularProgressProps) {
  const percentage = (value / max) * 100;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("relative", className)}
      {...props}
    >
      <svg className="h-full w-full" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          className="stroke-muted"
          cx="50"
          cy="50"
          r="48"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Progress circle */}
        <circle
          className="stroke-primary transition-all duration-300 ease-in-out"
          cx="50"
          cy="50"
          r="48"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${percentage * 3}, 1000`}
          transform="rotate(-90 50 50)"
        />
      </svg>
    </div>
  );
}
