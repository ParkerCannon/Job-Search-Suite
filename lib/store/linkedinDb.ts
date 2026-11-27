import type { LinkedInExportSnapshot } from "@/lib/types";

const DB_NAME = "job-search-suite-linkedin";
const STORE_NAME = "exports";
const KEY = "latest";
const FALLBACK_KEY = "job-search-suite:linkedin-fallback";

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
}

export async function getLinkedInSnapshot(): Promise<LinkedInExportSnapshot | null> {
  if (!canUseIndexedDb()) {
    try {
      const raw = window.localStorage.getItem(FALLBACK_KEY);
      return raw ? (JSON.parse(raw) as LinkedInExportSnapshot) : null;
    } catch {
      return null;
    }
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(KEY);
    request.onsuccess = () => resolve((request.result as LinkedInExportSnapshot | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read LinkedIn data."));
  });
}

export async function saveLinkedInSnapshot(snapshot: LinkedInExportSnapshot): Promise<void> {
  if (!canUseIndexedDb()) {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(snapshot, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save LinkedIn data."));
  });
}

export async function clearLinkedInSnapshot(): Promise<void> {
  if (!canUseIndexedDb()) {
    window.localStorage.removeItem(FALLBACK_KEY);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear LinkedIn data."));
  });
}
