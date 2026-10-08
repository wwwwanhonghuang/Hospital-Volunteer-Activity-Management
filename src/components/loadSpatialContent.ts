// SPDX-License-Identifier: AGPL-3.0-only
const loadedContent = new Map<string, Promise<unknown>>();

/** Fetch declarative content as a separate resource, without executing its data. */
export async function loadSpatialContent<T>(url: string): Promise<T> {
  if (!loadedContent.has(url)) {
    const request = fetch(url).then(response => {
      if (!response.ok) throw new Error(`Spatial content could not be loaded (${response.status}).`);
      return response.json() as Promise<unknown>;
    });
    loadedContent.set(url, request);
    // A failed request may be retried by a subsequent caller.
    void request.catch(() => loadedContent.delete(url));
  }
  return loadedContent.get(url)! as Promise<T>;
}
