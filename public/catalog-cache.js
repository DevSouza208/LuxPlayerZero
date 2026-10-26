/** Catálogo do visitante neste dispositivo, sem guardar a URL de importação ou chaves. */
const DB = 'luxzero-guest-catalog';
export function createCatalogCache(indexedDB = globalThis.indexedDB) {
  let queue = Promise.resolve();
  async function access(mode, action) {
    if (!indexedDB) return null;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('catalog');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction('catalog', mode);
        const request = action(transaction.objectStore('catalog'));
        transaction.oncomplete = () => resolve(mode === 'readonly' ? request.result ?? null : true);
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }
  function run(mode, action) {
    const result = queue.then(() => access(mode, action)).catch(() => null);
    queue = result.then(() => undefined);
    return result;
  }
  return {
    save(items) { return run('readwrite', store => store.put({items, savedAt:Date.now()}, 'current')); },
    read() { return run('readonly', store => store.get('current')); },
    clear() { return run('readwrite', store => store.delete('current')); }
  };
}
