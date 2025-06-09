import { FileX } from "lucide-react";

export function EmptyReleases() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4">
      <div className="flex flex-col items-center gap-2 max-w-[420px] text-center">
        <FileX className="h-12 w-12 text-muted-foreground" />
        <h3 className="text-lg font-semibold">No releases found</h3>
        <p className="text-sm text-muted-foreground">
          There are no releases that match your search criteria. Try adjusting
          your filters or create a new release.
        </p>
      </div>
    </div>
  );
}
