import { cn } from "lib/utils";
import { getCurrentEnvironment } from "../environment-selector";

interface EnvironmentBadgeProps {
  className?: string;
  showLabel?: boolean;
  variant?: "default" | "compact";
}

interface EnvironmentStyle {
  badge: string;
  banner: string;
  icon: string;
  label: string;
  shortLabel: string;
}

const getEnvironmentStyles = (): EnvironmentStyle => {
  const currentEnv = getCurrentEnvironment();

  const styles: Record<string, EnvironmentStyle> = {
    Production: {
      badge: "bg-red-500 text-red-50 border-red-600",
      banner: "bg-red-50 border-red-200",
      icon: "🔒",
      label: "Production",
      shortLabel: "Prod",
    },
    Staging: {
      badge: "bg-amber-500 text-amber-50 border-amber-600",
      banner: "bg-amber-50 border-amber-200",
      icon: "⚡",
      label: "Staging",
      shortLabel: "Stage",
    },
    Development: {
      badge: "bg-green-500 text-green-50 border-green-600",
      banner: "bg-green-50 border-green-200",
      icon: "🛠",
      label: "Development",
      shortLabel: "Dev",
    },
  };

  return styles[currentEnv];
};

export function EnvironmentBadge({
  className,
  showLabel = true,
  variant = "default",
}: EnvironmentBadgeProps) {
  const styles = getEnvironmentStyles();

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "inline-flex items-center",
          "px-2 py-1 rounded-full text-xs font-medium",
          styles.badge,
          className
        )}
      >
        {styles.icon}
        <span className="ml-1">{styles.shortLabel}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        "bg-background/95 backdrop-blur",
        "py-1 px-2",
        styles.banner,
        className
      )}
    >
      <div
        className={cn(
          "px-2 py-0.5 rounded-full",
          "text-sm font-medium flex items-center gap-1.5",
          styles.badge
        )}
      >
        <span className="shrink-0">{styles.icon}</span>
        {showLabel && (
          <>
            <span className="hidden sm:inline">{styles.label}</span>
            <span className="sm:hidden">{styles.shortLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
