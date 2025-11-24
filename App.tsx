
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader, useProgress } from '@react-three/drei';
import { GameStatus, NoteData } from './types';
import { SONG_LIST, generateChart, SongConfig } from './constants';
import { useMediaPipe } from './hooks/useMediaPipe';
import GameScene from './components/GameScene';
import WebcamPreview from './components/WebcamPreview';
import { Play, RefreshCw, VideoOff, Music, Volume2, ChevronRight, ChevronLeft, Zap, Upload, X, Trash2, Save, Settings, Sparkles, Shield, ShieldAlert } from 'lucide-react';
import { saveSongToDB, getAllSongsFromDB, deleteSongFromDB } from './utils/db';
import { GoogleGenAI, Schema, Type } from "@google/genai";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const App: React.FC = () => {
  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.LOADING);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [health, setHealth] = useState(100);
  const [countdown, setCountdown] = useState(0);
  
  // Game Modes
  const [isNoFailMode, setIsNoFailMode] = useState(false);

  // Song State
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [librarySongs, setLibrarySongs] = useState<SongConfig[]>([]);
  
  // Combine built-in songs with user library
  const playlist = useMemo(() => [...SONG_LIST, ...librarySongs], [librarySongs]);
  const activeSong = playlist[currentSongIndex] || SONG_LIST[0];

  // Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [tempFile, setTempFile] = useState<File | null>(null);
  const [bpmInput, setBpmInput] = useState<string>("128");
  const [offsetInput, setOffsetInput] = useState<string>("0");
  const [isAnalyzing, setIsAnalyzing] = useState(false); // AI Analysis State

  const [activeChart, setActiveChart] = useState<NoteData[]>([]);

  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Now getting lastResultsRef from the hook
  const { isCameraReady, handPositionsRef, lastResultsRef, error: cameraError } = useMediaPipe(videoRef);
  
  // Load saved songs on startup
  useEffect(() => {
      const loadLibrary = async () => {
          try {
              const saved = await getAllSongsFromDB();
              setLibrarySongs(saved);
          } catch (e) {
              console.error("Failed to load song library", e);
          }
      };
      loadLibrary();
  }, []);

  useEffect(() => {
      // When active song changes, update audio and chart
      if (audioRef.current && activeSong) {
          audioRef.current.src = activeSong.url;
          audioRef.current.load();
          
          // Reset playback rate
          if (activeSong.id === 'cyber-city') {
              audioRef.current.playbackRate = 0.8; 
          } else {
              audioRef.current.playbackRate = 1.0;
          }
      }
      if (activeSong) {
        // Generate chart with offset
        setActiveChart(generateChart(activeSong.bpm, activeSong.offset || 0));
      }
  }, [activeSong]);

  // Handle Song Switch
  const switchSong = (direction: 'next' | 'prev') => {
      let newIndex = direction === 'next' ? currentSongIndex + 1 : currentSongIndex - 1;
      if (newIndex >= playlist.length) newIndex = 0;
      if (newIndex < 0) newIndex = playlist.length - 1;
      
      setCurrentSongIndex(newIndex);
  };

  const deleteCurrentSong = async () => {
      if (activeSong.isCustom) {
          if (confirm(`Remove "${activeSong.title}" from your library?`)) {
              await deleteSongFromDB(activeSong.id);
              // Clean up blob URL
              URL.revokeObjectURL(activeSong.url);
              
              // Remove from state
              const newLib = await getAllSongsFromDB();
              setLibrarySongs(newLib);
              setCurrentSongIndex(0); // Go back to first song
          }
      }
  };

  // Helper to convert Blob to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove "data:audio/mp3;base64," prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // AI Analysis Logic
  const analyzeAudioWithGemini = async (file: File) => {
    setIsAnalyzing(true);
    try {
      const base64Audio = await fileToBase64(file);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                {
                    inlineData: {
                        mimeType: file.type || 'audio/mp3',
                        data: base64Audio
                    }
                },
                {
                    text: "Analyze this audio track. Identify the tempo in Beats Per Minute (BPM) and the exact timestamp in seconds of the first strong beat (offset). Return a JSON object."
                }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    bpm: { type: Type.INTEGER, description: "The tempo of the song in beats per minute" },
                    offset: { type: Type.NUMBER, description: "The time in seconds of the first beat (offset)" }
                },
                required: ["bpm", "offset"]
            }
        }
      });

      const result = JSON.parse(response.text || "{}");
      
      if (result.bpm) setBpmInput(result.bpm.toString());
      if (result.offset !== undefined) setOffsetInput(result.offset.toString());

    } catch (error) {
        console.error("AI Analysis failed:", error);
        alert("AI could not analyze the audio. Please enter BPM manually.");
    } finally {
        setIsAnalyzing(false);
    }
  };

  // Custom Song Handlers
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          setTempFile(file);
          setShowUploadModal(true);
          // Auto-trigger AI analysis
          analyzeAudioWithGemini(file);
      }
      // Reset input so same file can be selected again if needed
      if (event.target) event.target.value = '';
  };

  const confirmCustomSong = async () => {
      if (!tempFile) return;
      
      const bpm = parseInt(bpmInput);
      const offset = parseFloat(offsetInput);

      if (isNaN(bpm) || bpm < 40 || bpm > 300) {
          alert("Please enter a valid BPM (40-300)");
          return;
      }
      
      if (isNaN(offset)) {
          alert("Please enter a valid Offset number");
          return;
      }

      // Create object URL just for immediate preview/logic
      const objectUrl = URL.createObjectURL(tempFile);
      
      const newSong: SongConfig = {
          id: `custom-${Date.now()}`,
          title: tempFile.name.replace(/\.[^/.]+$/, ""), // Remove extension
          artist: 'My Library',
          url: objectUrl,
          bpm: bpm,
          difficulty: 'Medium', // Default
          color: '#e879f9', // Custom color
          offset: offset, // Save Offset
          isCustom: true
      };

      // Save to IndexedDB
      try {
          await saveSongToDB(newSong, tempFile);
          
          // Reload library
          const newLib = await getAllSongsFromDB();
          setLibrarySongs(newLib);
          
          // Switch to the newly added song (it will be at the end)
          setCurrentSongIndex(SONG_LIST.length + newLib.length - 1);
          
          setShowUploadModal(false);
          setTempFile(null);
          setBpmInput("128");
          setOffsetInput("0");
      } catch (e) {
          alert("Failed to save song to library. Storage might be full.");
          console.error(e);
      }
  };

  // Game Logic Handlers
  const handleNoteHit = useCallback((note: NoteData, goodCut: boolean) => {
     let points = 100;
     if (goodCut) points += 50; 

     // Haptic feedback for impact
     if (navigator.vibrate) {
         navigator.vibrate(goodCut ? 40 : 20);
     }

     setCombo(c => {
       const newCombo = c + 1;
       if (newCombo > 30) setMultiplier(8);
       else if (newCombo > 20) setMultiplier(4);
       else if (newCombo > 10) setMultiplier(2);
       else setMultiplier(1);
       return newCombo;
     });

     setScore(s => s + (points * multiplier));
     
     // Only heal if not in No Fail Mode (or heal anyway, but it matters less)
     setHealth(h => Math.min(100, h + 2));
  }, [multiplier]);

  const handleNoteMiss = useCallback((note: NoteData) => {
      setCombo(0);
      setMultiplier(1);
      
      // LOGIC CHANGE: If No Fail Mode is ON, do NOT reduce health
      if (!isNoFailMode) {
          setHealth(h => {
              const newHealth = h - 15;
              if (newHealth <= 0) {
                 setTimeout(() => endGame(false), 0);
                 return 0;
              }
              return newHealth;
          });
      }
  }, [isNoFailMode]);

  // Initiate the sequence: IDLE -> COUNTDOWN -> PLAYING
  const handleStartRequest = () => {
      if (!isCameraReady) return;
      
      setScore(0);
      setCombo(0);
      setMultiplier(1);
      setHealth(100);
      
      // Reset chart state
      activeChart.forEach(n => { n.hit = false; n.missed = false; });

      // Start Countdown phase (4 seconds)
      setCountdown(4);
      setGameStatus(GameStatus.COUNTDOWN);
  };

  // Countdown Timer Logic
  useEffect(() => {
      let timer: any;
      if (gameStatus === GameStatus.COUNTDOWN) {
          if (countdown > 0) {
              timer = setTimeout(() => setCountdown(c => c - 1), 1000);
          } else {
              // Countdown finished, start actual game
              startGameplay();
          }
      }
      return () => clearTimeout(timer);
  }, [gameStatus, countdown]);

  const startGameplay = async () => {
    try {
      if (audioRef.current) {
          audioRef.current.currentTime = 0;
          await audioRef.current.play();
          setGameStatus(GameStatus.PLAYING);
      }
    } catch (e) {
        console.error("Audio play failed", e);
        setGameStatus(GameStatus.IDLE);
        alert("Could not start audio. Please interact with the page first.");
    }
  };

  const endGame = (victory: boolean) => {
      setGameStatus(victory ? GameStatus.VICTORY : GameStatus.GAME_OVER);
      if (audioRef.current) {
          audioRef.current.pause();
      }
  };

  useEffect(() => {
      if (gameStatus === GameStatus.LOADING && isCameraReady) {
          setGameStatus(GameStatus.IDLE);
      }
  }, [isCameraReady, gameStatus]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans">
      {/* Hidden Video for Processing */}
      <video 
        ref={videoRef} 
        className="absolute opacity-0 pointer-events-none"
        playsInline
        muted
        autoPlay
        style={{ width: '640px', height: '480px' }}
      />

      {/* Hidden File Input */}
      <input 
        type="file" 
        accept="audio/*" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileSelect}
      />

      {/* 3D Canvas */}
      <Canvas shadows dpr={[1, 2]}>
          {gameStatus !== GameStatus.LOADING && (
             <GameScene 
                gameStatus={gameStatus}
                audioRef={audioRef}
                handPositionsRef={handPositionsRef}
                chart={activeChart}
                onNoteHit={handleNoteHit}
                onNoteMiss={handleNoteMiss}
                onSongEnd={() => endGame(true)}
             />
          )}
      </Canvas>

      {/* Webcam Mini-Map Preview */}
      <WebcamPreview 
          videoRef={videoRef} 
          resultsRef={lastResultsRef} 
          isCameraReady={isCameraReady} 
      />

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-10">
          
          {/* HUD (Top) */}
          {(gameStatus === GameStatus.PLAYING || gameStatus === GameStatus.COUNTDOWN) && (
              <div className="flex justify-between items-start text-white w-full animate-fade-in">
                 {/* Health Bar */}
                 <div className="w-1/3 max-w-xs">
                     <div className={`h-4 bg-gray-800 rounded-full overflow-hidden border-2 ${isNoFailMode ? 'border-blue-500' : 'border-gray-700'}`}>
                         <div 
                            className={`h-full transition-all duration-300 ease-out ${
                                isNoFailMode ? 'bg-blue-500' :
                                health > 50 ? 'bg-green-500' : health > 20 ? 'bg-yellow-500' : 'bg-red-600'
                            }`}
                            style={{ width: `${health}%` }}
                         />
                     </div>
                     <p className="text-xs mt-1 opacity-70 flex items-center gap-1">
                        {isNoFailMode ? <><Shield size={12} /> NO FAIL ACTIVE</> : 'Energy'}
                     </p>
                 </div>

                 {/* Score & Combo */}
                 <div className="text-center">
                     <h1 className="text-5xl font-bold tracking-wider drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]">
                         {score.toLocaleString()}
                     </h1>
                     <div className="mt-2 flex flex-col items-center">
                         <p className={`text-2xl font-bold ${combo > 10 ? 'text-blue-400 scale-110' : 'text-gray-300'} transition-all`}>
                             {combo}x COMBO
                         </p>
                         {multiplier > 1 && (
                             <span className="text-sm px-2 py-1 bg-blue-900 rounded-full mt-1 animate-pulse">
                                 {multiplier}x Multiplier!
                             </span>
                         )}
                     </div>
                 </div>
                 
                 <div className="w-1/3 flex justify-end">
                     <div className="text-right opacity-80">
                         <p className="text-sm font-bold text-blue-300">{activeSong.title}</p>
                         <p className="text-xs">{activeSong.artist}</p>
                         {isNoFailMode && <span className="text-[10px] bg-blue-900 px-1 rounded text-white">SCORE ONLY</span>}
                     </div>
                 </div>
              </div>
          )}

          {/* Menus (Centered) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
              
              {/* Upload Modal */}
              {showUploadModal && (
                  <div className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center backdrop-blur-sm animate-fade-in">
                      <div className="bg-gray-900 p-8 rounded-2xl border border-blue-500 w-full max-w-md shadow-2xl">
                          <div className="flex justify-between items-center mb-6">
                              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                Add to Library 
                                {isAnalyzing && <span className="text-xs text-blue-400 animate-pulse font-normal">(AI Analyzing...)</span>}
                              </h3>
                              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-white">
                                  <X />
                              </button>
                          </div>
                          
                          <div className="mb-6">
                              <p className="text-blue-300 mb-2 text-sm font-bold">Selected File:</p>
                              <p className="text-white bg-black/50 p-3 rounded-lg truncate">{tempFile?.name}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-8">
                              <div>
                                <label className="block text-blue-300 text-sm font-bold mb-2 flex items-center gap-1">
                                    BPM {isAnalyzing && <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>}
                                </label>
                                <input 
                                    type="number" 
                                    value={bpmInput}
                                    onChange={(e) => setBpmInput(e.target.value)}
                                    disabled={isAnalyzing}
                                    className={`w-full bg-black/50 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none text-xl font-mono ${isAnalyzing ? 'opacity-50' : ''}`}
                                    placeholder="128"
                                />
                              </div>
                              <div>
                                <label className="block text-blue-300 text-sm font-bold mb-2 flex items-center gap-1">
                                    Offset (sec) {isAnalyzing && <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>}
                                </label>
                                <input 
                                    type="number"
                                    step="0.01" 
                                    value={offsetInput}
                                    onChange={(e) => setOffsetInput(e.target.value)}
                                    disabled={isAnalyzing}
                                    className={`w-full bg-black/50 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none text-xl font-mono ${isAnalyzing ? 'opacity-50' : ''}`}
                                    placeholder="0.0"
                                />
                              </div>
                              <div className="col-span-2">
                                {isAnalyzing ? (
                                    <div className="bg-blue-900/30 border border-blue-500/30 p-2 rounded text-xs text-blue-300 flex items-center gap-2">
                                        <Sparkles size={12} /> Gemini is listening to your track to detect beats...
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500">
                                        Use Offset if notes appear too early or late. Positive value = notes appear later.
                                    </p>
                                )}
                              </div>
                          </div>

                          <button 
                              onClick={confirmCustomSong}
                              disabled={isAnalyzing}
                              className={`w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                              <Save size={18} /> Save & Select
                          </button>
                      </div>
                  </div>
              )}

              {gameStatus === GameStatus.LOADING && (
                  <div className="bg-black/80 p-10 rounded-2xl flex flex-col items-center border border-blue-900/50 backdrop-blur-md">
                      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-6"></div>
                      <h2 className="text-2xl text-white font-bold mb-2">System Initializing</h2>
                      <p className="text-blue-300">{!isCameraReady ? "Accessing neural link..." : "Loading library..."}</p>
                      {cameraError && <p className="text-red-500 mt-4 max-w-xs text-center">{cameraError}</p>}
                  </div>
              )}

              {gameStatus === GameStatus.COUNTDOWN && (
                  <div className="flex flex-col items-center justify-center">
                       <div className="text-center mb-8 bg-black/40 backdrop-blur-md p-6 rounded-xl border border-white/10 animate-pulse">
                           <h2 className="text-3xl font-bold text-blue-400 mb-2">GET READY!</h2>
                           <p className="text-white text-lg">Step back & Align your hands with the lanes</p>
                           <div className="flex gap-8 mt-4 opacity-80">
                               <div className="text-red-500 font-bold">LEFT HAND</div>
                               <div className="text-blue-500 font-bold">RIGHT HAND</div>
                           </div>
                       </div>
                       
                       <div className="text-[12rem] font-black text-white drop-shadow-[0_0_50px_rgba(255,255,255,0.8)] scale-150 transition-all duration-300">
                           {countdown > 0 ? countdown : "GO!"}
                       </div>
                  </div>
              )}

              {gameStatus === GameStatus.IDLE && !showUploadModal && (
                  <div className="bg-black/80 p-12 rounded-3xl text-center border-2 border-blue-500/30 backdrop-blur-xl max-w-2xl w-full">
                      <div className="mb-4 flex justify-center">
                         <Zap className="w-16 h-16 text-yellow-400" />
                      </div>
                      <h1 className="text-6xl font-black text-white mb-8 tracking-tighter italic drop-shadow-[0_0_30px_rgba(59,130,246,0.6)]">
                          TEMPO <span className="text-blue-500">STRIKE</span>
                      </h1>

                      {/* Song Selection */}
                      <div className="mb-8 bg-white/5 p-6 rounded-xl border border-white/10 relative overflow-hidden">
                          <div className="flex items-center justify-center gap-2 mb-4">
                              <h3 className="text-blue-300 text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                                 <Music size={16} /> Select Track
                              </h3>
                              <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400">
                                {currentSongIndex + 1} / {playlist.length}
                              </span>
                          </div>
                          
                          <div className="flex items-center justify-between gap-4">
                              <button 
                                onClick={() => switchSong('prev')}
                                className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                              >
                                  <ChevronLeft />
                              </button>
                              
                              <div className="flex-1 text-center overflow-hidden">
                                  <h2 className="text-2xl font-bold text-white mb-1 truncate px-2">{activeSong.title}</h2>
                                  <p className="text-gray-400 text-sm mb-2">{activeSong.artist}</p>
                                  <div className="flex justify-center gap-3">
                                      <span className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300 font-mono">
                                          {activeSong.bpm} BPM
                                      </span>
                                      {activeSong.offset !== 0 && (
                                          <span className="px-2 py-1 bg-gray-800 rounded text-xs text-yellow-500 font-mono border border-yellow-500/30">
                                              {activeSong.offset > 0 ? '+' : ''}{activeSong.offset}s
                                          </span>
                                      )}
                                      <span 
                                        className="px-2 py-1 rounded text-xs font-bold text-black uppercase"
                                        style={{ backgroundColor: activeSong.color }}
                                      >
                                          {activeSong.difficulty}
                                      </span>
                                  </div>
                              </div>

                              <button 
                                onClick={() => switchSong('next')}
                                className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                              >
                                  <ChevronRight />
                              </button>
                          </div>

                          {/* Action Buttons */}
                          <div className="mt-6 pt-4 border-t border-white/10 flex justify-center gap-4">
                               <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-blue-400 text-sm flex items-center gap-2 hover:text-blue-300 transition-colors bg-blue-900/30 px-3 py-2 rounded-lg"
                                >
                                    <Upload size={14} /> Add to Library
                                </button>

                              {activeSong.isCustom && (
                                  <button 
                                      onClick={deleteCurrentSong}
                                      className="text-red-400 text-sm flex items-center gap-2 hover:text-red-300 hover:bg-red-900/30 px-3 py-2 rounded-lg transition-colors"
                                  >
                                      <Trash2 size={14} /> Delete
                                  </button>
                              )}
                          </div>
                      </div>

                      {/* No Fail Toggle */}
                      <div className="mb-6 flex justify-center">
                          <button
                            onClick={() => setIsNoFailMode(!isNoFailMode)}
                            className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all duration-300 border ${isNoFailMode ? 'bg-blue-900/50 border-blue-400 text-blue-200' : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
                          >
                             {isNoFailMode ? <Shield className="text-blue-400" /> : <ShieldAlert />}
                             <div className="text-left">
                                 <div className="text-sm font-bold uppercase tracking-wider">No Fail Mode</div>
                                 <div className="text-[10px] opacity-70">
                                     {isNoFailMode ? "Invincible (Score Only)" : "Normal Damage"}
                                 </div>
                             </div>
                          </button>
                      </div>

                      {!isCameraReady ? (
                           <div className="flex items-center justify-center text-red-400 gap-2 bg-red-900/20 p-4 rounded-lg">
                               <VideoOff /> Camera not ready yet.
                           </div>
                      ) : (
                          <button 
                              onClick={handleStartRequest}
                              className="bg-blue-600 hover:bg-blue-500 text-white text-xl font-bold py-4 px-12 rounded-full transition-all transform hover:scale-105 hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] flex items-center justify-center mx-auto gap-3"
                          >
                              <Play fill="currentColor" /> START GAME
                          </button>
                      )}
                  </div>
              )}

              {(gameStatus === GameStatus.GAME_OVER || gameStatus === GameStatus.VICTORY) && (
                  <div className="bg-black/90 p-12 rounded-3xl text-center border-2 border-white/10 backdrop-blur-xl">
                      <h2 className={`text-6xl font-bold mb-4 ${gameStatus === GameStatus.VICTORY ? 'text-green-400' : 'text-red-500'}`}>
                          {gameStatus === GameStatus.VICTORY ? "TRACK COMPLETE" : "SYSTEM FAILURE"}
                      </h2>
                      <p className="text-white text-3xl mb-8">Final Score: {score.toLocaleString()}</p>
                      <button 
                          onClick={() => setGameStatus(GameStatus.IDLE)}
                          className="bg-white/10 hover:bg-white/20 text-white text-xl py-3 px-8 rounded-full flex items-center justify-center mx-auto gap-2 transition-colors"
                      >
                          <RefreshCw /> Replay / Select Song
                      </button>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};

export default App;
