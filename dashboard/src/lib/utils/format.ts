export function formatFileSize(bytes?: number): string {
  if (!bytes) return "N/A";
  
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
} 