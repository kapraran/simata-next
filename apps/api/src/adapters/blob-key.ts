// Pure helpers shared by the fs and R2 blob stores. No node imports, so the Worker bundle
// stays free of node builtins.

const TYPES: Record<string, string> = {
  json: "application/json",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function contentTypeFor(key: string): string {
  return TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream";
}

/** Keys are plain relative paths: letters, digits, dot, dash, underscore, slash. */
export function validKey(key: string): boolean {
  return /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(key) && !key.split("/").includes("..");
}
