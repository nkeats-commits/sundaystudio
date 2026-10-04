export type NativeSharePorts = {
  writeTextFile: (filename: string, text: string) => Promise<string>;
  shareFile: (uri: string, title: string) => Promise<void>;
};

export function safeExportFilename(filename: string): string {
  const basename = filename.replace(/\\/g, "/").split("/").pop() || "";
  const safe = basename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+/, "")
    .slice(0, 100);
  return safe || "sunday-studio-export.txt";
}

/** Small injectable seam keeps file/share failure handling testable on Node. */
export async function shareTextFileWithPorts(
  title: string,
  text: string,
  filename: string,
  ports: NativeSharePorts,
): Promise<void> {
  const uri = await ports.writeTextFile(safeExportFilename(filename), text);
  if (!uri) throw new Error("The export file could not be created.");
  await ports.shareFile(uri, title);
}