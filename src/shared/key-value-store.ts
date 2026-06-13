import { get, del, set, createStore } from 'idb-keyval'

export interface KeyValueStore {
  getItem<T>(key: string): Promise<T | null>
  setItem<T>(key: string, value: T): Promise<void>
  removeItem(key: string): Promise<void>
}

export function createMemoryKeyValueStore(): KeyValueStore {
  const storage = new Map<string, unknown>()

  return {
    async getItem<T>(key: string): Promise<T | null> {
      return storage.has(key) ? (storage.get(key) as T) : null
    },
    async setItem<T>(key: string, value: T): Promise<void> {
      storage.set(key, value)
    },
    async removeItem(key: string): Promise<void> {
      storage.delete(key)
    },
  }
}

export function createLocalStorageKeyValueStore(namespace = 'md-reader'): KeyValueStore {
  const prefix = `${namespace}:`

  return {
    async getItem<T>(key: string): Promise<T | null> {
      const raw = window.localStorage.getItem(prefix + key)
      return raw ? (JSON.parse(raw) as T) : null
    },
    async setItem<T>(key: string, value: T): Promise<void> {
      window.localStorage.setItem(prefix + key, JSON.stringify(value))
    },
    async removeItem(key: string): Promise<void> {
      window.localStorage.removeItem(prefix + key)
    },
  }
}

export function createIndexedDbKeyValueStore(
  databaseName = 'md-reader',
  storeName = 'workspace',
): KeyValueStore {
  const store = createStore(databaseName, storeName)

  return {
    async getItem<T>(key: string): Promise<T | null> {
      return (await get<T>(key, store)) ?? null
    },
    async setItem<T>(key: string, value: T): Promise<void> {
      await set(key, value, store)
    },
    async removeItem(key: string): Promise<void> {
      await del(key, store)
    },
  }
}

export function createBrowserKeyValueStore(namespace = 'md-reader'): KeyValueStore {
  if (typeof indexedDB !== 'undefined') {
    return createIndexedDbKeyValueStore(namespace, 'workspace')
  }

  return createLocalStorageKeyValueStore(namespace)
}
