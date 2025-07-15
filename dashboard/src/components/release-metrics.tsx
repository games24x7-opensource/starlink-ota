import { CircularProgress } from "components/ui/circular-progress";
import { Separator } from "components/ui/separator";
import { useEffect, useState } from "react";
import type { TRelease } from "lib/types";
import { fetchReleaseMetrics, calculateTotalActiveDevices } from "lib/api";
import { TReleaseMetric } from "lib/types";

interface ReleaseMetricsProps {
  releaseData: TRelease;
  appName?: string;
  deploymentName?: string;
  releaseMetrics?: TReleaseMetric;
}

export function ReleaseMetrics({
  releaseData,
  appName,
  deploymentName,
}: ReleaseMetricsProps) {
  const [metrics, setMetrics] = useState<TReleaseMetric | null>(null);
  const [totalDevices, setTotalDevices] = useState(0);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const allMetrics = await fetchReleaseMetrics(appName, deploymentName);

        // Find metrics for current release
        const releaseMetrics = allMetrics.metrics[releaseData.label];
        if (releaseMetrics) {
          setMetrics(releaseMetrics);
        }

        // Calculate total devices
        const total = calculateTotalActiveDevices(allMetrics);
        setTotalDevices(total);
      } catch (error) {
        console.error("Error loading metrics:", error);
      }
    };

    loadMetrics();
  }, [releaseData.label, appName, deploymentName]);

  const activePercentage = metrics ? (metrics.active / totalDevices) * 100 : 0;
  const rolloutPercentage = releaseData.rolloutPercentage ?? 100;

  return (
    <>
      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        {/* Progress Circles */}
        <div className="flex gap-8 items-center justify-center">
          <div className="relative flex aspect-square w-full max-w-[160px] flex-col items-center justify-center">
            <div className="absolute inset-0">
              <CircularProgress
                value={rolloutPercentage}
                className="h-full w-full [--thickness:2px]"
              />
            </div>
            <div className="z-10 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">
                {rolloutPercentage}%
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground">
                ROLLOUT
              </div>
            </div>
          </div>

          <div className="relative flex aspect-square w-full max-w-[160px] flex-col items-center justify-center">
            <div className="absolute inset-0">
              <CircularProgress
                value={activePercentage}
                className="h-full w-full [--thickness:2px]"
              />
            </div>
            <div className="z-10 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">
                {activePercentage.toFixed(2)}%
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground">
                ACTIVE
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">
                {metrics?.active || 0} of {totalDevices}
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4 h-fit">
          <div className="p-6 rounded-lg border border-input hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {metrics?.active.toLocaleString() || 0}
            </p>
            <p className="text-sm text-green-700 dark:text-green-500">
              Active Devices
            </p>
          </div>
          <div className="p-6 rounded-lg border border-input hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {metrics?.downloaded.toLocaleString() || 0}
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-500">
              Downloads
            </p>
          </div>
          <div className="p-6 rounded-lg border border-input hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors">
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {metrics?.installed.toLocaleString() || 0}
            </p>
            <p className="text-sm text-purple-700 dark:text-purple-500">
              Installed
            </p>
          </div>
          <div className="p-6 rounded-lg border border-input hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {metrics?.failed.toLocaleString() || 0}
            </p>
            <p className="text-sm text-red-700 dark:text-red-500">Failed</p>
          </div>
        </div>
      </div>
      <Separator className="my-6" />
    </>
  );
}
