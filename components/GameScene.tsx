

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, PerspectiveCamera, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { GameStatus, NoteData, HandPositions, COLORS, CutDirection } from '../types';
import { PLAYER_Z, SPAWN_Z, MISS_Z, NOTE_SPEED, DIRECTION_VECTORS, NOTE_SIZE, LANE_X_POSITIONS, LAYER_Y_POSITIONS, LANE_WIDTH } from '../constants';
import Note from './Note';
import Saber from './Saber';

interface GameSceneProps {
  gameStatus: GameStatus;
  audioRef: React.RefObject<HTMLAudioElement>;
  handPositionsRef: React.MutableRefObject<any>; // Simplified type for the raw ref
  chart: NoteData[];
  onNoteHit: (note: NoteData, goodCut: boolean) => void;
  onNoteMiss: (note: NoteData) => void;
  onSongEnd: () => void;
}

// --- COMPONENT: FLOOR & LANES ---
// Separates the gameplay area (Lanes) from the environment grid
const FloorSystem = () => {
    const gridRef = useRef<THREE.Group>(null);
    const lanesRef = useRef<THREE.Group>(null);
    
    // Calculate lane borders: Center is 0. 
    // Borders are at -2, -1, 0, 1, 2 units relative to Lane Width
    const laneBorders = [-2, -1, 0, 1, 2].map(i => i * LANE_WIDTH);

    useFrame((state) => {
        if (gridRef.current) {
            // Move outer grid to simulate speed
            gridRef.current.position.z = (state.clock.getElapsedTime() * NOTE_SPEED) % 2;
        }
        if (lanesRef.current) {
             // Subtle pulse for lane dividers
             const t = state.clock.getElapsedTime();
             lanesRef.current.children.forEach((child, idx) => {
                 if (child instanceof THREE.Mesh) {
                     // Pulse opacity
                     (child.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 2 + idx) * 0.1;
                 }
             });
        }
    });

    return (
        <group>
             {/* 1. Reflective Base Floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, -25]}>
                <planeGeometry args={[60, 100]} />
                <meshStandardMaterial 
                    color="#020202" 
                    roughness={0.1} 
                    metalness={0.8} 
                />
            </mesh>

            {/* 2. Gameplay Lanes (The 4 center tracks) */}
            <group ref={lanesRef} position={[0, -0.08, -25]}>
                {/* Draw Divider Lines */}
                {laneBorders.map((x, i) => (
                    <mesh key={i} position={[x, 0.02, 0]} rotation={[-Math.PI/2, 0, 0]}>
                        <planeGeometry args={[0.05, 100]} />
                        <meshBasicMaterial 
                            color={i === 2 ? '#ffffff' : '#444444'} // Center line is white, others grey
                            transparent 
                            opacity={0.5} 
                        />
                    </mesh>
                ))}
                
                {/* Lane Highlights (Subtle color tint on floor) */}
                {/* Left Lanes (Red tint) */}
                <mesh position={[-LANE_WIDTH, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                     <planeGeometry args={[LANE_WIDTH * 2, 100]} />
                     <meshBasicMaterial color={COLORS.left} transparent opacity={0.03} />
                </mesh>
                {/* Right Lanes (Blue tint) */}
                <mesh position={[LANE_WIDTH, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                     <planeGeometry args={[LANE_WIDTH * 2, 100]} />
                     <meshBasicMaterial color={COLORS.right} transparent opacity={0.03} />
                </mesh>
            </group>

            {/* 3. Outer Grid (Environment Only - Pushed to sides) */}
            <group ref={gridRef}>
                {/* Left Outer Grid */}
                <gridHelper 
                    args={[30, 15, 0x222222, 0x111111]} 
                    position={[-20, -0.05, -25]} 
                    scale={[1, 1, 2]} 
                />
                {/* Right Outer Grid */}
                 <gridHelper 
                    args={[30, 15, 0x222222, 0x111111]} 
                    position={[20, -0.05, -25]} 
                    scale={[1, 1, 2]} 
                />
            </group>
        </group>
    )
}

// --- COMPONENT: STRIKE ZONE ---
// Visual indicators aligned perfectly with note paths
const StrikeZone = () => {
    const groupRef = useRef<THREE.Group>(null);
    
    useFrame((state) => {
        if (groupRef.current) {
            const t = state.clock.getElapsedTime();
            // Subtle breathing effect
            const scale = 1 + Math.sin(t * 8) * 0.01;
            groupRef.current.scale.setScalar(scale);
        }
    });

    // Default height for frames (Layer 0)
    const BASE_Y = LAYER_Y_POSITIONS[0]; 
    // Calculate proper frame size based on Lane Width
    const FRAME_RADIUS = LANE_WIDTH * 0.35; 

    return (
        <group ref={groupRef} position={[0, 0, PLAYER_Z]}>
            {LANE_X_POSITIONS.map((xPos, index) => {
                const isLeft = index < 2;
                const color = isLeft ? COLORS.left : COLORS.right;
                
                return (
                    <group key={index} position={[xPos, 0, 0]}>
                        {/* 1. Floor Marker (Runway End) */}
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
                            <planeGeometry args={[LANE_WIDTH * 0.9, 0.4]} />
                            <meshBasicMaterial color={color} transparent opacity={0.5} />
                        </mesh>
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, -1]}>
                             <planeGeometry args={[0.05, 2]} />
                             <meshBasicMaterial color={color} transparent opacity={0.3} />
                        </mesh>

                        {/* 2. Floating Target Frame */}
                        {/* Positioned exactly where the note center will be */}
                        <group position={[0, BASE_Y, 0]}>
                            {/* Frame Outline - Scaled to fit lane width */}
                            <mesh rotation={[0, 0, Math.PI/4]}>
                                <torusGeometry args={[FRAME_RADIUS, 0.03, 4, 4]} /> 
                                <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.6} />
                            </mesh>
                            
                            {/* Corner Accents */}
                            <mesh position={[FRAME_RADIUS, 0, 0]}><boxGeometry args={[0.08, 0.04, 0.04]} /><meshBasicMaterial color="white" /></mesh>
                            <mesh position={[-FRAME_RADIUS, 0, 0]}><boxGeometry args={[0.08, 0.04, 0.04]} /><meshBasicMaterial color="white" /></mesh>
                        </group>
                    </group>
                );
            })}
        </group>
    );
};

const GameScene: React.FC<GameSceneProps> = ({ 
    gameStatus, 
    audioRef, 
    handPositionsRef, 
    chart,
    onNoteHit,
    onNoteMiss,
    onSongEnd
}) => {
  // Local state for notes to trigger re-renders when they are hit/missed
  const [notesState, setNotesState] = useState<NoteData[]>(chart);
  const [currentTime, setCurrentTime] = useState(0);

  // Refs for things we don't want causing re-renders every frame
  const activeNotesRef = useRef<NoteData[]>([]);
  const nextNoteIndexRef = useRef(0);
  const shakeIntensity = useRef(0);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const spotLightRef = useRef<THREE.SpotLight>(null);

  // When chart changes (new song), reset everything
  useEffect(() => {
    setNotesState(chart);
    nextNoteIndexRef.current = 0;
    activeNotesRef.current = [];
  }, [chart]);

  // Helper Vector3s for collision to avoid GC
  const vecA = useMemo(() => new THREE.Vector3(), []);
  const vecB = useMemo(() => new THREE.Vector3(), []);

  // Wrap onNoteHit to add Scene-level effects (Camera shake)
  const handleHit = (note: NoteData, goodCut: boolean) => {
      shakeIntensity.current = goodCut ? 0.3 : 0.15;
      onNoteHit(note, goodCut);
  }

  useFrame((state, delta) => {
    // --- Beat Pulsing ---
    if (audioRef.current && gameStatus === GameStatus.PLAYING) {
        const time = audioRef.current.currentTime;
        const pulse = Math.abs(Math.sin(time * 10)); 
        
        if (ambientLightRef.current) {
            ambientLightRef.current.intensity = 0.1 + (pulse * 0.2);
        }
        if (spotLightRef.current) {
            spotLightRef.current.intensity = 0.5 + (pulse * 0.5);
        }
    } else if (gameStatus === GameStatus.COUNTDOWN || gameStatus === GameStatus.IDLE) {
        if (ambientLightRef.current) ambientLightRef.current.intensity = 0.4;
        if (spotLightRef.current) spotLightRef.current.intensity = 1.0;
    }

    // --- Camera Shake ---
    if (shakeIntensity.current > 0 && cameraRef.current) {
        const shake = shakeIntensity.current;
        cameraRef.current.position.x = (Math.random() - 0.5) * shake;
        cameraRef.current.position.y = 1.8 + (Math.random() - 0.5) * shake;
        cameraRef.current.position.z = 4 + (Math.random() - 0.5) * shake;
        
        shakeIntensity.current = THREE.MathUtils.lerp(shakeIntensity.current, 0, 10 * delta);
        if (shakeIntensity.current < 0.01) {
             shakeIntensity.current = 0;
             cameraRef.current.position.set(0, 1.8, 4);
        }
    }

    // --- GAMEPLAY LOGIC (Stop here if not playing) ---
    if (gameStatus !== GameStatus.PLAYING || !audioRef.current) return;

    // Sync time with audio
    const time = audioRef.current.currentTime;
    setCurrentTime(time);

    if (audioRef.current.ended) {
        onSongEnd();
        return;
    }

    // 1. Spawn Notes
    const spawnAheadTime = Math.abs(SPAWN_Z - PLAYER_Z) / NOTE_SPEED;
    
    while (nextNoteIndexRef.current < notesState.length) {
      const nextNote = notesState[nextNoteIndexRef.current];
      if (nextNote.time - spawnAheadTime <= time) {
        activeNotesRef.current.push(nextNote);
        nextNoteIndexRef.current++;
      } else {
        break;
      }
    }

    // 2. Update & Collide Notes
    const hands = handPositionsRef.current as HandPositions;

    for (let i = activeNotesRef.current.length - 1; i >= 0; i--) {
        const note = activeNotesRef.current[i];
        if (note.hit || note.missed) continue;

        // Calculate current Z position
        const timeDiff = note.time - time; 
        const currentZ = PLAYER_Z - (timeDiff * NOTE_SPEED);

        // Miss check (passed player)
        if (currentZ > MISS_Z) {
            note.missed = true;
            onNoteMiss(note);
            activeNotesRef.current.splice(i, 1);
            continue;
        }

        // Collision check (only if near player)
        if (currentZ > PLAYER_Z - 1.5 && currentZ < PLAYER_Z + 1.0) {
            const handPos = note.type === 'left' ? hands.left : hands.right;
            const handVel = note.type === 'left' ? hands.leftVelocity : hands.rightVelocity;

            if (handPos) {
                 const notePos = vecA.set(
                     LANE_X_POSITIONS[note.lineIndex],
                     LAYER_Y_POSITIONS[note.lineLayer],
                     currentZ
                 );

                 // Collision radius slightly larger for wider lanes
                 if (handPos.distanceTo(notePos) < 0.9) {
                     let goodCut = true;
                     const speed = handVel.length();

                     if (note.cutDirection !== CutDirection.ANY) {
                         const requiredDir = DIRECTION_VECTORS[note.cutDirection];
                         vecB.copy(handVel).normalize();
                         const dot = vecB.dot(requiredDir);
                         
                         if (dot < 0.3 || speed < 1.5) { 
                             goodCut = false;
                         }
                     } else {
                         if (speed < 1.5) goodCut = false; 
                     }

                     note.hit = true;
                     note.hitTime = time;
                     handleHit(note, goodCut);
                     activeNotesRef.current.splice(i, 1);
                 }
            }
        }
    }
  });

  // Map active notes to components. 
  const visibleNotes = useMemo(() => {
     return notesState.filter(n => 
         !n.missed && 
         (!n.hit || (currentTime - (n.hitTime || 0) < 0.5)) && 
         (n.time - currentTime) < 5 && 
         (n.time - currentTime) > -2 
     );
  }, [notesState, currentTime]);

  // Refs for visual sabers
  const leftHandPosRef = useRef<THREE.Vector3 | null>(null);
  const rightHandPosRef = useRef<THREE.Vector3 | null>(null);
  const leftHandVelRef = useRef<THREE.Vector3 | null>(null);
  const rightHandVelRef = useRef<THREE.Vector3 | null>(null);

  useFrame(() => {
     leftHandPosRef.current = handPositionsRef.current.left;
     rightHandPosRef.current = handPositionsRef.current.right;
     leftHandVelRef.current = handPositionsRef.current.leftVelocity;
     rightHandVelRef.current = handPositionsRef.current.rightVelocity;
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 1.8, 4]} fov={60} />
      <color attach="background" args={['#050505']} />
      <fog attach="fog" args={['#050505', 5, 40]} />
      
      {/* Pulsing Lights */}
      <ambientLight ref={ambientLightRef} intensity={0.2} />
      <spotLight ref={spotLightRef} position={[0, 10, 5]} angle={0.5} penumbra={1} intensity={1} castShadow />
      
      <Environment preset="night" />

      <FloorSystem />
      <StrikeZone />
      
      <Stars radius={50} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />

      <Saber type="left" positionRef={leftHandPosRef} velocityRef={leftHandVelRef} />
      <Saber type="right" positionRef={rightHandPosRef} velocityRef={rightHandVelRef} />

      {visibleNotes.map(note => (
          <Note 
            key={note.id} 
            data={note} 
            zPos={PLAYER_Z - ((note.time - currentTime) * NOTE_SPEED)} 
            currentTime={currentTime}
          />
      ))}
    </>
  );
};

export default GameScene;