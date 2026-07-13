export async function readJsonResponse<T extends object>(
  res: Response
): Promise<T> {
  const text = await res.text();
  if (!text) {
    if (!res.ok) {
      throw new Error(res.statusText || `Request failed (${res.status})`);
    }
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
    if (res.status === 413 || /entity too large/i.test(text)) {
      throw new Error(
        "File is too large to upload directly. The app will parse it in your browser and import in batches — refresh and try again."
      );
    }
    throw new Error(
      res.ok
        ? "Server returned an invalid response."
        : preview || `Request failed (${res.status})`
    );
  }
}
