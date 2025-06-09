const roleColors: Record<string, string> = {
  Owner: "bg-primary/10 text-primary border-primary/20",
  Collaborator: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  Unknown: "bg-muted text-muted-foreground border-input",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`px-2 py-1 rounded-md text-xs font-medium border ${
        roleColors[role] || roleColors.Unknown
      }`}
    >
      {role}
    </span>
  );
}
