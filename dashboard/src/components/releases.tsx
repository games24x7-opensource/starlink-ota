import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ReleaseCard } from "components/release-card";
import { ReleaseDetails } from "components/release-details";
import { EmptyReleases } from "components/empty-releases";
import { Search } from "lucide-react";
import { Input } from "components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/ui/select";
import { Sheet, SheetContent } from "components/ui/sheet";
import {
  fetchReleases,
  fetchDeployments,
  updateSpecificReleaseDetails,
} from "lib/api";
import type {
  TRelease,
  UpdateReleaseRequest,
  UpdateReleaseResponse,
} from "lib/types";
import { useAppName } from "../contexts/AppNameContext";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Key } from "lucide-react";
import { DeploymentKeyDialog } from "components/deployment-key-dialog";
import { useApp } from "../contexts/app-context";
import { getCurrentEnvironment } from "./environment-selector";

export function Releases() {
  const { appName } = useParams<{ appName: string }>();
  const { setAppName } = useAppName();
  const selectedEnvironment = getCurrentEnvironment();
  const { setDeployments, setIsLoading } = useApp();
  const [releases, setReleases] = useState<TRelease[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    null
  );
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [selectedApp, setSelectedApp] = useState<{ name: string } | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isReleasesLoading, setIsReleasesLoading] = useState(false);
  const currentEnv = getCurrentEnvironment(); // Get current environment

  // Combined effect for app name and deployments
  useEffect(() => {
    if (!appName) return;

    setAppName(appName);
    setIsInitialLoad(true);

    const loadDeployments = async () => {
      try {
        setIsLoading(true);
        const data = await fetchDeployments(appName);
        setDeployments(data);
      } catch (error) {
        console.error("Error loading deployments:", error);
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    };

    loadDeployments();
  }, [appName, setAppName, setDeployments, setIsLoading]);

  // Load releases on mount
  useEffect(() => {
    if (!appName) return;

    setAppName(appName);
    setIsReleasesLoading(true);
    setReleases([]);

    const loadReleases = async () => {
      try {
        const data = await fetchReleases({
          appName,
          environment: currentEnv, // Use current environment
        });
        setReleases(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error loading releases:", error);
      } finally {
        setIsReleasesLoading(false);
      }
    };

    loadReleases();
  }, [appName, setAppName, currentEnv]);

  // Move early return after hooks
  if (!appName) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <p className="text-muted-foreground">App name is required</p>
      </div>
    );
  }

  const filteredReleases = releases
    .sort((a, b) => {
      // Convert uploadTime strings to numbers and sort in descending order (latest first)
      const timeA = a.uploadTime ? parseInt(a.uploadTime) : 0;
      const timeB = b.uploadTime ? parseInt(b.uploadTime) : 0;
      return timeB - timeA;
    })
    .filter((release) => {
      const matchesSearch =
        release.label.toLowerCase().includes(search.toLowerCase()) ||
        release.releasedBy.toLowerCase().includes(search.toLowerCase()) ||
        release.appVersion.toLowerCase().includes(search.toLowerCase());

      const matchesFilter =
        filter === "all" ||
        (filter === "enabled" && !release.isDisabled) ||
        (filter === "disabled" && release.isDisabled);

      return matchesSearch && matchesFilter;
    });

  const selectedRelease = releases.find(
    (release) => release.label === selectedReleaseId
  );

  const handleReleaseClick = (releaseId: string) => {
    setSelectedReleaseId(releaseId);
    setIsPanelOpen(true);
  };

  const handleUpdateRelease = async (
    updatedRelease: TRelease
  ): Promise<UpdateReleaseResponse | null | undefined> => {
    if (!selectedEnvironment || !appName) return undefined;

    try {
      setIsLoading(true);

      const updateData: UpdateReleaseRequest = {
        packageInfo: {
          description: updatedRelease.description,
          isDisabled: updatedRelease.isDisabled,
          isMandatory: updatedRelease.isMandatory,
          appVersion: updatedRelease.appVersion,
          label: updatedRelease.label,
        },
      };

      const response = await updateSpecificReleaseDetails(
        appName,
        selectedEnvironment,
        updateData
      );

      // If we get a response, update the UI
      if (response) {
        const data = await fetchReleases({
          appName,
          environment: selectedEnvironment,
        });
        setReleases(Array.isArray(data) ? data : []);
      }

      return response;
    } catch (error) {
      console.error("Error updating release:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  function ReleaseCardSkeleton() {
    return (
      <Card className="animate-pulse">
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6">
          <div className="grid gap-1 mb-4 sm:mb-0">
            <div className="flex items-center gap-2">
              <div className="h-5 w-32 bg-muted rounded" />
              <div className="h-5 w-16 bg-muted rounded-full" />
            </div>
            <div className="h-4 w-24 bg-muted rounded mt-1" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid gap-1">
              <div className="h-4 w-20 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
            <div className="grid gap-1">
              <div className="h-4 w-16 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
            <div className="grid gap-1">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-3 w-28 bg-muted rounded" />
            </div>
            <div className="grid gap-1">
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 bg-background p-4 sm:p-6 rounded-lg shadow-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Releases</h1>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search releases..."
            className="pl-10 bg-background border-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Select defaultValue="all" onValueChange={setFilter}>
            <SelectTrigger className="w-[180px] bg-background border-input">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Releases</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setSelectedApp({ name: appName })}
            className="flex items-center gap-2"
            title="View deployment keys"
          >
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">Deployment Keys</span>
          </Button>
        </div>
      </div>
      <div className="overflow-y-auto pr-2 sm:pr-4 -mr-2 sm:-mr-4 h-[calc(100vh-240px)] sm:h-[calc(100vh-280px)]">
        {isInitialLoad ? (
          <div className="grid gap-4">
            {[...Array(3)].map((_, i) => (
              <ReleaseCardSkeleton key={i} />
            ))}
          </div>
        ) : isReleasesLoading ? (
          <div className="grid gap-4">
            {[...Array(3)].map((_, i) => (
              <ReleaseCardSkeleton key={i} />
            ))}
          </div>
        ) : releases.length > 0 ? (
          <div className="grid gap-4">
            {filteredReleases.map((release) => (
              <ReleaseCard
                key={release.label}
                release={release}
                isSelected={selectedReleaseId === release.label}
                onClick={() => handleReleaseClick(release.label)}
              />
            ))}
          </div>
        ) : (
          <EmptyReleases />
        )}
      </div>

      <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[55%] sm:max-w-[55%] p-0"
        >
          {selectedRelease && (
            <ReleaseDetails
              release={selectedRelease}
              onClose={() => setIsPanelOpen(false)}
              onUpdate={handleUpdateRelease}
            />
          )}
        </SheetContent>
      </Sheet>

      <DeploymentKeyDialog
        open={!!selectedApp}
        onOpenChange={(open) => !open && setSelectedApp(null)}
        appName={appName}
      />
    </div>
  );
}
