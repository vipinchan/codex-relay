const globalState = globalThis as typeof globalThis & {
  __codexRelayMockMmkvStores?: Map<string, Map<string, string>>;
};
const stores = (globalState.__codexRelayMockMmkvStores ??= new Map());

export function createMMKV(options?: { id?: string }) {
  const id = options?.id ?? "default";
  let store = stores.get(id);
  if (!store) {
    store = new Map();
    stores.set(id, store);
  }

  return {
    getString(key: string) {
      return store.get(key);
    },
    remove(key: string) {
      store.delete(key);
    },
    set(key: string, value: string) {
      store.set(key, value);
    },
  };
}
