import { Badge } from "components/ui/badge";
import { Button } from "components/ui/button";
import { Card, CardContent } from "components/ui/card";
import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { formatFileSize } from "lib/utils/format";

import type { TRelease } from "lib/types";

// Add the formatDate helper
const formatDate = (epochTime?: string) => {
  if (!epochTime) return "N/A";
  const date = new Date(parseInt(epochTime));
  return format(date, "MMM dd, HH:mm"); // Shorter format: "Mar 14, 14:30"
};

function getStatusColors(isDisabled: boolean) {
  return isDisabled
    ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800"
    : "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800";
}

interface ReleaseCardProps {
  release: TRelease;
  isSelected: boolean;
  onClick: () => void;
  isLoading?: boolean;
}

export function ReleaseCard({
  release,
  isSelected,
  onClick,
  isLoading = false,
}: ReleaseCardProps) {
  if (isLoading) {
    return (
      <Card className="animate-pulse">{/* Add loading skeleton here */}</Card>
    );
  }

  const handleClick = () => {
    if (!isLoading) {
      onClick();
    }
  };

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-muted ${
        isSelected ? "border-primary" : "border-border"
      }`}
      onClick={handleClick}
    >
      <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6">
        <div className="grid gap-1 mb-4 sm:mb-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{release.label}</h3>
            <Badge
              variant={release.isDisabled ? "default" : "secondary"}
              className={getStatusColors(release.isDisabled)}
            >
              {release.isDisabled ? "Disabled" : "Enabled"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{release.releasedBy}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="grid gap-1">
            <p className="font-medium text-foreground">{release.appVersion}</p>
            <p className="text-muted-foreground">Target Version</p>
          </div>
          <div className="grid gap-1">
            <p className="font-medium text-foreground">
              {formatFileSize(release.size)}
            </p>
            <p className="text-muted-foreground">Size</p>
          </div>
          <div className="grid gap-1">
            <p className="font-medium text-foreground">
              {formatDate(release.uploadTime)}
            </p>
            <p className="text-muted-foreground">Release Date</p>
          </div>
          <Button variant="ghost" size="icon" className="ml-2">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
