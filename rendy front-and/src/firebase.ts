import { initializeApp } from 'firebase/app'
import { getAuth, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  enableIndexedDbPersistence,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

// Gunakan konfigurasi aplikasi Web dari Firebase Console (Project settings → Your apps).
// Konfigurasi Web boleh berada di frontend; jangan gunakan service-account JSON di sini.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'smart-zoo-118da',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

if (!firebaseConfig.apiKey || !firebaseConfig.appId) {
  console.warn('[Firebase] Konfigurasi aplikasi Web belum lengkap. Tambahkan VITE_FIREBASE_API_KEY dan VITE_FIREBASE_APP_ID ke .env.local.')
}

// Inisialisasi Firebase App & Cloud Firestore
export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut }

// Aktifkan offline persistence jika didukung oleh browser
if (typeof window !== 'undefined') {
  try {
    enableIndexedDbPersistence(db).catch(() => {
      // IndexedDB persistence fallback aman
    })
  } catch {
    // Abaikan jika persistence tidak didukung
  }
}

export const FIREBASE_PROJECT_NAME = 'Smart Zoo'
export const FIREBASE_PROJECT_ID = 'smart-zoo-118da'

// Fungsi menyimpan dokumen ke Cloud Firestore
export async function saveToFirestore<T extends { id: string }>(collectionName: string, data: T): Promise<boolean> {
  try {
    const docRef = doc(db, collectionName, data.id)
    // Pastikan tidak ada undefined value agar Firestore tidak menolak
    const sanitized = JSON.parse(JSON.stringify(data))
    await setDoc(docRef, { ...sanitized, _updatedAt: new Date().toISOString() }, { merge: true })
    console.log(`[Firebase] Data tersimpan di collection '${collectionName}/${data.id}'`)
    return true
  } catch (err) {
    console.warn(`[Firebase] Gagal menyimpan ke '${collectionName}':`, err)
    return false
  }
}

// Fungsi menghapus dokumen dari Cloud Firestore
export async function deleteFromFirestore(collectionName: string, id: string): Promise<boolean> {
  try {
    const docRef = doc(db, collectionName, id)
    await deleteDoc(docRef)
    console.log(`[Firebase] Data dihapus dari collection '${collectionName}/${id}'`)
    return true
  } catch (err) {
    console.warn(`[Firebase] Gagal menghapus dari '${collectionName}':`, err)
    return false
  }
}

// Fungsi listener real-time Firestore
export function subscribeToFirestore<T extends { id: string }>(
  collectionName: string,
  onData: (items: T[]) => void,
  onError?: (err: Error) => void,
) {
  const colRef = collection(db, collectionName)
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const { _updatedAt: _updatedAt, _createdAt: _createdAt, ...data } = d.data()
        return { ...data, id: d.id } as T
      })
      onData(items)
    },
    (err) => {
      console.warn(`[Firebase] Error sinkronisasi koleksi '${collectionName}':`, err)
      if (onError) onError(err)
    },
  )
}

function signature<T extends { id: string }>(items: T[]) {
  return JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)))
}

async function replaceFirestoreCollection<T extends { id: string }>(collectionName: string, items: T[]) {
  const existing = await getDocs(collection(db, collectionName))
  const ids = new Set(items.map((item) => item.id))
  const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = []

  for (const item of items) {
    const sanitized = JSON.parse(JSON.stringify(item)) as DocumentData
    operations.push((batch) => batch.set(doc(db, collectionName, item.id), {
      ...sanitized,
      _updatedAt: new Date().toISOString(),
    }))
  }
  for (const existingDoc of existing.docs) {
    if (!ids.has(existingDoc.id)) operations.push((batch) => batch.delete(existingDoc.ref))
  }

  for (let index = 0; index < operations.length; index += 450) {
    const batch = writeBatch(db)
    operations.slice(index, index + 450).forEach((operation) => operation(batch))
    await batch.commit()
  }
}

/** Sinkronisasi real-time koleksi Firestore, dengan localStorage sebagai cache/offline fallback. */
export function useFirestoreCollection<T extends { id: string }>(
  collectionName: string,
  storageKey: string,
  initialItems: T[] | (() => T[]),
): [T[], Dispatch<SetStateAction<T[]>>] {
  const [items, setItems] = useState<T[]>(() => {
    try {
      const cached = localStorage.getItem(storageKey)
      if (cached) {
        const parsed: unknown = JSON.parse(cached)
        if (Array.isArray(parsed)) return parsed as T[]
      }
    } catch {
      // Cache rusak atau localStorage tidak tersedia; gunakan data awal.
    }
    return typeof initialItems === 'function' ? initialItems() : initialItems
  })
  const [ready, setReady] = useState(false)
  const latestItems = useRef(items)
  const lastSyncedSignature = useRef<string | null>(null)
  const syncQueue = useRef<Promise<void>>(Promise.resolve())
  latestItems.current = items

  useEffect(() => subscribeToFirestore<T>(
    collectionName,
    (remoteItems) => {
      lastSyncedSignature.current = signature(remoteItems)
      if (remoteItems.length > 0) {
        setItems((current) => signature(current) === signature(remoteItems) ? current : remoteItems)
      }
      setReady(true)
      window.dispatchEvent(new Event('rimbakita:data-changed'))
    },
    (error) => {
      console.warn(`[Firebase] Sinkronisasi '${collectionName}' tidak tersedia; cache lokal tetap digunakan.`, error)
      setReady(true)
    },
  ), [collectionName])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items))
    } catch (error) {
      console.warn(`[Storage] Gagal menyimpan cache '${storageKey}'.`, error)
    }
    window.dispatchEvent(new Event('rimbakita:data-changed'))
    if (!ready) return

    syncQueue.current = syncQueue.current.then(async () => {
      const currentItems = latestItems.current
      const currentSignature = signature(currentItems)
      if (currentSignature === lastSyncedSignature.current) return
      await replaceFirestoreCollection(collectionName, currentItems)
      lastSyncedSignature.current = currentSignature
    }).catch((error: unknown) => {
      console.warn(`[Firebase] Gagal menyimpan koleksi '${collectionName}'.`, error)
    })
  }, [collectionName, items, ready, storageKey])

  return [items, setItems]
}

// Fungsi inisialisasi / seeding data awal ke Cloud Firestore saat koleksi pertama kali dibuat
export async function seedFirestoreIfEmpty<T extends { id: string }>(
  collectionName: string,
  initialItems: T[],
): Promise<boolean> {
  try {
    const colRef = collection(db, collectionName)
    const snapshot = await getDocs(colRef)
    if (snapshot.empty && initialItems.length > 0) {
      console.log(`[Firebase] Melakukan seeding data awal ke Cloud Firestore '${collectionName}' (${initialItems.length} data)...`)
      for (const item of initialItems) {
        const sanitized = JSON.parse(JSON.stringify(item))
        await setDoc(doc(db, collectionName, item.id), {
          ...sanitized,
          _createdAt: new Date().toISOString(),
        })
      }
      return true
    }
    return false
  } catch (err) {
    console.warn(`[Firebase] Gagal seeding koleksi '${collectionName}':`, err)
    return false
  }
}
