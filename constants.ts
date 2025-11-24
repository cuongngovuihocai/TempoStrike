

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { CutDirection, NoteData } from "./types";
import * as THREE from 'three';

// Game World Config
export const TRACK_LENGTH = 50;
export const SPAWN_Z = -30;
export const PLAYER_Z = 0;
export const MISS_Z = 5;
export const NOTE_SPEED = 10; 

// WIDENED LANES
export const LANE_WIDTH = 1.4; // Increased from 0.8 for wider gameplay
export const LAYER_HEIGHT = 0.8;
export const NOTE_SIZE = 0.7; // Increased from 0.5 to match wider lanes

// Positions for the 4 lanes (centered around 0)
// Formula: [-1.5, -0.5, 0.5, 1.5] * WIDTH
export const LANE_X_POSITIONS = [-1.5 * LANE_WIDTH, -0.5 * LANE_WIDTH, 0.5 * LANE_WIDTH, 1.5 * LANE_WIDTH];
export const LAYER_Y_POSITIONS = [0.8, 1.6, 2.4]; // Low, Mid, High

// Helper to get random integer
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// --- SONG CONFIGURATION ---
export interface SongConfig {
    id: string;
    title: string;
    artist: string;
    url: string;
    bpm: number;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    color: string;
    offset: number; // Time in seconds to shift the chart (Latency compensation)
    isCustom?: boolean; // Flag to identify user uploaded songs
}

export const SONG_LIST: SongConfig[] = [
    {
        id: 'neon-racer',
        title: 'Neon Racer',
        artist: 'Rice Racer Assets',
        url: 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/race2.ogg',
        bpm: 140,
        difficulty: 'Hard',
        color: '#3b82f6', // Blue theme
        offset: 0.1 // Slight delay for intro
    },
    {
        id: 'dream-scape',
        title: 'Dream Scape',
        artist: 'Epoq',
        url: 'https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg',
        bpm: 130, // Slightly slower
        difficulty: 'Medium',
        color: '#a855f7', // Purple theme
        offset: 0.05
    },
     {
        id: 'cyber-city',
        title: 'Cyber City (Slow)',
        artist: 'Rice Racer Assets',
        url: 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/race2.ogg',
        bpm: 110, // Simulated slower track (handled by playbackRate in App)
        difficulty: 'Easy',
        color: '#10b981', // Green theme
        offset: 0.1
    }
];

// Generate a rhythmic chart dynamically based on BPM and Offset
export const generateChart = (bpm: number, offset: number = 0, durationSeconds: number = 300): NoteData[] => {
  const notes: NoteData[] = [];
  let idCount = 0;
  
  const beatTime = 60 / bpm;
  
  // Calculate total beats needed to cover the duration
  // Add a buffer to ensure we cover the very end
  const totalBeats = Math.ceil((durationSeconds / 60) * bpm);

  // Simple pattern generator
  for (let i = 4; i < totalBeats; i += 2) { // Start after 4 beats
    // IMPORTANT: Add the offset here. 
    // If offset is positive (e.g. 0.5s), notes appear 0.5s later.
    const time = offset + (i * beatTime);
    
    // Cycle patterns based on bars (16 beats)
    const pattern = Math.floor(i / 16) % 3;

    if (pattern === 0) {
      // PATTERN 1: Distributed Single Hits
      // Evenly distributed across 4 lanes
      if (i % 4 === 0) {
         // Left Hand (Lanes 0 or 1)
         notes.push({
          id: `note-${idCount++}`,
          time: time,
          lineIndex: getRandomInt(0, 1), 
          lineLayer: 0,
          type: 'left',
          cutDirection: CutDirection.ANY,
        });
      } else {
        // Right Hand (Lanes 2 or 3)
        notes.push({
          id: `note-${idCount++}`,
          time: time,
          lineIndex: getRandomInt(2, 3), 
          lineLayer: 0,
          type: 'right',
          cutDirection: CutDirection.ANY,
        });
      }
    } else if (pattern === 1) {
      // PATTERN 2: Double Hits (Wide)
      if (i % 8 === 0) {
         notes.push(
           { id: `note-${idCount++}`, time, lineIndex: 0, lineLayer: 1, type: 'left', cutDirection: CutDirection.ANY },
           { id: `note-${idCount++}`, time, lineIndex: 3, lineLayer: 1, type: 'right', cutDirection: CutDirection.ANY }
         );
      }
    } else {
      // PATTERN 3: Streams (Faster)
      notes.push({
        id: `note-${idCount++}`,
        time: time,
        lineIndex: getRandomInt(0, 1),
        lineLayer: 0,
        type: 'left',
        cutDirection: CutDirection.ANY,
      });
       notes.push({
        id: `note-${idCount++}`,
        time: time + beatTime,
        lineIndex: getRandomInt(2, 3),
        lineLayer: 0,
        type: 'right',
        cutDirection: CutDirection.ANY,
      });
    }
  }

  return notes.sort((a, b) => a.time - b.time);
};

// Vectors for direction checking
export const DIRECTION_VECTORS: Record<CutDirection, THREE.Vector3> = {
  [CutDirection.UP]: new THREE.Vector3(0, 1, 0),
  [CutDirection.DOWN]: new THREE.Vector3(0, -1, 0),
  [CutDirection.LEFT]: new THREE.Vector3(-1, 0, 0),
  [CutDirection.RIGHT]: new THREE.Vector3(1, 0, 0),
  [CutDirection.ANY]: new THREE.Vector3(0, 0, 0) // Magnitude check only
};