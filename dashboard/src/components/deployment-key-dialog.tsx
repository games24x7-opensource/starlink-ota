import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Copy, Key } from "lucide-react";
import { fetchDeploymentKey } from "lib/api";
import { cn } from "lib/utils";
import { getCurrentEnvironment } from "./environment-selector";

interface DeploymentKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appName: string;
}

export function DeploymentKeyDialog({
  open,
  onOpenChange,
  appName,
}: DeploymentKeyDialogProps) {
  const [key, setKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const environment = getCurrentEnvironment();

  useEffect(() => {
    const loadKey = async () => {
      if (!open || !environment) return;

      try {
        setIsLoading(true);
        const data = await fetchDeploymentKey(appName, environment);
        setKey(data?.deployment?.key);
      } catch (error) {
        console.error("Error loading deployment key:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadKey();
  }, [open, appName, environment]);

  const handleCopy = async () => {
    if (!key) return;
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Key className="h-5 w-5" />
            <div className="flex items-center gap-3">
              <span>Deployment Key</span>
              <div className="relative inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium bg-primary/5 text-primary ring-1 ring-primary/10">
                <span className="font-semibold">{environment}</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <code className="text-sm font-mono break-all">
                {isLoading ? "Loading..." : key || "No key available"}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={!key || isLoading}
                className={cn(
                  "shrink-0 gap-2",
                  copied && "text-green-500 hover:text-green-600"
                )}
              >
                <Copy className="h-4 w-4" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm text-muted-foreground">
              Use this deployment key to configure your app for the{" "}
              <span className="font-medium">{environment}</span> environment.
              Keep this key secure and don't share it publicly.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
