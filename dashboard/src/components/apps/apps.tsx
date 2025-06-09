import { useEffect, useState } from "react";
import { getApps } from "lib/api";
import { useNavigate } from "react-router-dom";
import { useDebouncedCallback } from "use-debounce";
import { Button } from "../ui/button";
import { AppsHeader } from "./apps-header";
import { AppsTable } from "./apps-table";
import { LoadingSkeleton } from "./loading-skeleton";
import type { App } from "../../types/apps";

export function Apps() {
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const navigate = useNavigate();

  const debouncedSearch = useDebouncedCallback(setSearchQuery, 300);

  useEffect(() => {
    const loadApps = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const data = await getApps();
        setApps(data);
      } catch (error) {
        console.error("Error loading apps:", error);
        setError("Failed to load apps. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    loadApps();
  }, []);

  const getRole = (collaborators: App["collaborators"]) => {
    const currentUser = Object.entries(collaborators).find(
      ([_, value]) => value.isCurrentAccount
    );
    return currentUser ? currentUser[1].permission : "Unknown";
  };

  const filteredApps = apps.filter((app) => {
    const matchesSearch = app.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesRole =
      roleFilter === "all" || getRole(app.collaborators) === roleFilter;
    return matchesSearch && matchesRole;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        setSelectedIndex((prev) => Math.min(prev + 1, filteredApps.length - 1));
      } else if (e.key === "ArrowUp") {
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        navigate(`/apps/${filteredApps[selectedIndex].name}/deployments`);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredApps, selectedIndex, navigate]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      <AppsHeader
        searchQuery={searchQuery}
        roleFilter={roleFilter}
        onSearchChange={(value) => {
          setSearchQuery(value);
          debouncedSearch(value);
        }}
        onRoleFilterChange={setRoleFilter}
      />

      <AppsTable
        apps={apps}
        filteredApps={filteredApps}
        selectedIndex={selectedIndex}
        getRole={getRole}
      />
    </div>
  );
}
