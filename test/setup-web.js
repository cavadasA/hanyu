// Node >= 22 exposes an inert global `localStorage` (dormant unless started with
// --localstorage-file). Vitest 2.1's jsdom environment skips keys that already
// exist on the Node global, so jsdom's own Storage never gets installed and
// window.localStorage resolves to undefined. Modules that read it at import
// time — apps/web/src/stores/appStore.js does — then fail to load at all.
//
// Reinstate a spec-shaped Storage on the jsdom window. Node-environment test
// files have no window and are left untouched.
class MemoryStorage {
  #data = new Map();

  get length() {
    return this.#data.size;
  }

  key(index) {
    return [...this.#data.keys()][index] ?? null;
  }

  getItem(key) {
    const k = String(key);
    return this.#data.has(k) ? this.#data.get(k) : null;
  }

  setItem(key, value) {
    this.#data.set(String(key), String(value));
  }

  removeItem(key) {
    this.#data.delete(String(key));
  }

  clear() {
    this.#data.clear();
  }
}

if (typeof window !== 'undefined') {
  for (const name of ['localStorage', 'sessionStorage']) {
    if (!window[name]) {
      Object.defineProperty(window, name, {
        value: new MemoryStorage(),
        configurable: true,
        writable: false,
      });
    }
  }
}
