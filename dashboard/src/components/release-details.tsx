import { Button } from "components/ui/button";
import { CircularProgress } from "components/ui/circular-progress";
import { Separator } from "components/ui/separator";
import { Pencil, X } from "lucide-react";
import { Avatar, AvatarFallback } from "components/ui/avatar";
import { Sheet, SheetContent } from "components/ui/sheet";
import { useState, useEffect } from "react";
import { EditReleaseForm } from "./edit-release-form";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { ReleaseMetrics } from "./release-metrics";
import { useParams } from "react-router-dom";
import { formatFileSize } from "lib/utils/format";
import { Badge } from "components/ui/badge";
import { Card, CardContent } from "components/ui/card";
import { Users, Upload, Calendar, Package } from "lucide-react";

import type {
  TRelease,
  TReleaseMetric,
  UpdateReleaseResponse,
} from "lib/types";

import { fetchReleaseMetrics, calculateTotalActiveDevices } from "lib/api";
import { getCurrentEnvironment } from "./environment-selector";

interface ReleaseDetailsProps {
  release: TRelease;
  onClose: () => void;
  onUpdate: (
    release: TRelease
  ) => Promise<UpdateReleaseResponse | null | undefined>;
}

export function ReleaseDetails({
  release,
  onClose,
  onUpdate,
}: ReleaseDetailsProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { appName } = useParams<{ appName: string }>();
  const [, setMetrics] = useState<TReleaseMetric | null>(null);
  const [totalDevices, setTotalDevices] = useState(0);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        setIsLoading(true);
        const allMetrics = await fetchReleaseMetrics(
          appName,
          getCurrentEnvironment()
        );

        const releaseMetrics = allMetrics.metrics[release.label];
        if (releaseMetrics) {
          setMetrics(releaseMetrics);
        }

        const total = calculateTotalActiveDevices(allMetrics);
        setTotalDevices(total);
      } catch (error) {
        console.error("Error loading metrics:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMetrics();
  }, [release.label, appName]);

  const handleSave = async (
    data: Partial<TRelease>
  ): Promise<UpdateReleaseResponse | null | undefined> => {
    const updatedRelease: TRelease = {
      ...release,
      ...data,
      isDisabled: data.isDisabled ?? release.isDisabled,
      isMandatory: data.isMandatory ?? release.isMandatory,
    };
    return handleUpdate(updatedRelease);
  };

  const handleUpdate = async (
    updatedData: TRelease
  ): Promise<UpdateReleaseResponse | null | undefined> => {
    try {
      const response = await onUpdate(updatedData);
      // Only close the edit form after successful update
      setIsEditOpen(false);
      return response;
    } catch (error) {
      console.error("Error updating release:", error);
      throw error;
    }
  };

  const formatDate = (epochTime?: string) => {
    if (!epochTime) return "N/A";
    const date = new Date(parseInt(epochTime));
    return format(date, "MMM dd, yyyy 'at' hh:mm a");
  };

  return (
    <div className="rounded-lg bg-background h-screen overflow-y-auto">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold text-foreground">
              {release.label}
            </h3>
            <Badge variant={release.isDisabled ? "secondary" : "default"}>
              {release.isDisabled ? "Disabled" : "Active"}
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsEditOpen(true)}
              className="hover:bg-muted h-10 w-10"
            >
              <Pencil className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="hover:bg-muted h-10 w-10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <CircularProgress value={0} className="w-8 h-8" />
        </div>
      ) : (
        <div className="p-6 space-y-8">
          {/* Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">
                      Version
                    </p>
                    <p className="text-sm font-medium mt-1">
                      {release.appVersion}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">
                      Size
                    </p>
                    <p className="text-sm font-medium mt-1">
                      {formatFileSize(release.size)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">
                      Released
                    </p>
                    <p className="text-sm font-medium mt-1">
                      {formatDate(release.uploadTime)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">
                      Devices
                    </p>
                    <p className="text-sm font-medium mt-1">{totalDevices}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Metrics Section */}
          <div>
            <h4 className="text-sm font-semibold mb-4">Release Metrics</h4>
            <ReleaseMetrics
              releaseData={release}
              appName={appName}
              deploymentName={getCurrentEnvironment()}
            />
          </div>

          <Separator />

          {/* Release Info */}
          <div className="space-y-6">
            <h4 className="text-sm font-semibold">Release Details</h4>
            <div className="grid gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Released By</p>
                  <div className="flex items-center gap-3 mt-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{release.releasedBy[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium leading-none">
                        {release.releasedBy}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {getCurrentEnvironment()} Environment
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    Release Method
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    Upload
                  </Badge>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Mandatory Update
                  </p>
                  <p className="text-sm font-medium mt-1">
                    {release.isMandatory ? "Yes" : "No"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Rollout</p>
                  <p className="text-sm font-medium mt-1">
                    {release.rolloutPercentage || 100}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Description */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Description</h4>
            <Card className="bg-muted/40">
              <CardContent className="p-4">
                <div className="prose prose-sm max-w-none text-foreground">
                  <ReactMarkdown>
                    {release.description || "No description provided"}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Edit Sheet */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[540px] md:max-w-[580px] lg:max-w-[500px] p-0 flex flex-col h-full"
        >
          <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Edit '{release.label}'</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditOpen(false)}
                className="hover:bg-muted h-10 w-10"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <EditReleaseForm
              release={release}
              onClose={() => setIsEditOpen(false)}
              onSave={handleSave}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
