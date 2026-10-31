/**
 * M2.2 client-side form shaping only. The owner-protected policy API remains
 * authoritative for folder existence, absolute path safety, overlaps and access.
 * No Write permission is expressible from these helpers.
 */
export type NewReadRoot = { label: string; absolutePath: string };
export type RootEnabledChange = { type: "root"; id: string; enabled: boolean };
export type RootRemoval = { id: string };

export function newReadRoot(label: string, absolutePath: string): NewReadRoot {
  if (typeof label !== "string" || typeof absolutePath !== "string") {
    throw new Error("Nama dan path folder harus berupa teks.");
  }
  const name = label.trim();
  const path = absolutePath.trim();
  if (!name || name.length > 80) throw new Error("Nama folder wajib diisi (maksimal 80 karakter).");
  if (!path || path.length > 4096) throw new Error("Path folder wajib diisi (maksimal 4096 karakter).");
  return { label: name, absolutePath: path };
}

function requireRootId(id: string): string {
  if (typeof id !== "string" || id.length < 1 || id.length > 80) {
    throw new Error("ID folder tidak valid.");
  }
  return id;
}

export function rootEnabledChange(id: string, enabled: boolean): RootEnabledChange {
  if (typeof enabled !== "boolean") throw new Error("Status folder tidak valid.");
  return { type: "root", id: requireRootId(id), enabled };
}

export function rootRemoval(id: string): RootRemoval {
  return { id: requireRootId(id) };
}
