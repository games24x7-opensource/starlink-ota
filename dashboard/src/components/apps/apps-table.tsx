import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { RoleBadge } from "./role-badge";
import type { App } from "../../types/apps";
import { EmptyState } from "./empty-state";
import { NoResults } from "./no-results";
import { DeploymentsList } from "./deployments-list";

interface AppsTableProps {
  apps: App[];
  filteredApps: App[];
  selectedIndex: number;
  getRole: (collaborators: App["collaborators"]) => string;
}

export function AppsTable({
  apps,
  filteredApps,
  selectedIndex,
  getRole,
}: AppsTableProps) {
  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="py-3 px-4 text-left font-medium">Name</th>
            <th className="py-3 px-4 text-left font-medium">Deployments</th>
            <th className="py-3 px-4 text-left font-medium">Role</th>
          </tr>
        </thead>
        <tbody>
          {filteredApps.length === 0 ? (
            <tr>
              <td colSpan={3}>
                {apps.length === 0 ? <EmptyState /> : <NoResults />}
              </td>
            </tr>
          ) : (
            filteredApps.map((app, index) => (
              <AppRow
                key={app.name}
                app={app}
                isSelected={selectedIndex === index}
                role={getRole(app.collaborators)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface AppRowProps {
  app: App;
  isSelected: boolean;
  role: string;
}

function AppRow({ app, isSelected, role }: AppRowProps) {
  return (
    <tr
      className={cn(
        "border-b transition-colors hover:bg-muted/50 cursor-pointer",
        isSelected && "bg-muted/50"
      )}
    >
      <td className="py-3 px-4">
        <Link
          to={`/apps/${app.name}/deployments`}
          className="flex items-center gap-3"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
            {app.name.charAt(0)}
          </div>
          {app.name}
        </Link>
      </td>
      <td className="py-3 px-4">
        <DeploymentsList deployments={app.deployments} />
      </td>
      <td className="py-3 px-4">
        <RoleBadge role={role} />
      </td>
    </tr>
  );
}
