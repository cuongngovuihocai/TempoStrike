

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { SongConfig } from '../constants';

const DB_NAME = 'TempoStrikeDB';
const DB_VERSION = 2; // Incremented version for schema change
const STORE_NAME = 'songs';

interface StoredSong {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  color: string;
  offset: number; // Added offset
  fileBlob: Blob; 
  createdAt: number;
}

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      } else {
          // If updating from V1 to V2, we might need to migrate data, 
          // but for this simple app, we'll let new fields be undefined/defaulted
      }
    };
  });
};

export const saveSongToDB = async (songConfig: SongConfig, file: Blob): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const storedSong: StoredSong = {
    id: songConfig.id,
    title: songConfig.title,
    artist: songConfig.artist,
    bpm: songConfig.bpm,
    difficulty: songConfig.difficulty,
    color: songConfig.color,
    offset: songConfig.offset || 0,
    fileBlob: file,
    createdAt: Date.now(),
  };

  store.put(storedSong);
  
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getAllSongsFromDB = async (): Promise<SongConfig[]> => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const results: StoredSong[] = request.result;
      // Convert stored blobs back to SongConfig with Blob URLs
      const songs: SongConfig[] = results.map(s => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        bpm: s.bpm,
        difficulty: s.difficulty as any,
        color: s.color,
        offset: s.offset || 0,
        url: URL.createObjectURL(s.fileBlob), // Create temporary URL for playback
        isCustom: true
      }));
      resolve(songs);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteSongFromDB = async (id: string): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.delete(id);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
