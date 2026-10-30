import { getStore } from "@netlify/blobs";
export function cloudStore() {
  return getStore({ name: "vcu-workshops-v1", consistency: "strong" });
}
// Read/modify/write is conditional: concurrent participants never overwrite one another.
export async function update(store, key, change) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const old = await store.getWithMetadata(key, { type: "json" });
    const value = old ? structuredClone(old.data) : null;
    const result = change(value);
    if (!result.write) return result.result;
    if (Buffer.byteLength(JSON.stringify(result.value ?? value)) > 5000000)
      throw Object.assign(
        new Error(
          "Workshop storage limit reached. Export a backup and create a new workshop.",
        ),
        { status: 413 },
      );
    const saved = await store.setJSON(
      key,
      result.value ?? value,
      old ? { onlyIfMatch: old.etag } : { onlyIfNew: true },
    );
    if (saved.modified) return result.result;
    await new Promise((resolve) =>
      setTimeout(resolve, 15 + Math.random() * (attempt + 1) * 20),
    );
  }
  throw Object.assign(
    new Error("저장이 몰리고 있어요. 잠시 후 다시 시도하세요."),
    { status: 409 },
  );
}
