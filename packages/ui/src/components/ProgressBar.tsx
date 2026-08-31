import React from "react";

export interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  className = "",
  barClassName = "",
}) => {
  const percentage = Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  return (
    <div className={`w-full h-2 bg-[#F4EFEB] rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full bg-[#C4624D] transition-all duration-300 rounded-full ${barClassName}`}
        style={{ width: `${percentage}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      />
    </div>
  );
};
