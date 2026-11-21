import React, { useRef, useState } from 'react';
import { Maximize2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';

interface VideoChapter {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
}

const CHAPTERS: VideoChapter[] = [
  { id: 'overview', label: '01 · Overview', startSec: 0, endSec: 4.0 },
  { id: 'courts', label: '02 · Live Courts', startSec: 4.0, endSec: 8.0 },
  { id: 'membership', label: '03 · QR Pass', startSec: 8.0, endSec: 12.0 },
  { id: 'shop', label: '04 · Pro Shop', startSec: 12.0, endSec: 16.0 },
  { id: 'clubhouse', label: '05 · Bar & Analytics', startSec: 16.0, endSec: 20.6 },
];

export function HeroSiteVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [theaterOpen, setTheaterOpen] = useState(false);

  const activeChapter =
    CHAPTERS.find((c) => currentTime >= c.startSec && currentTime < c.endSec) || CHAPTERS[0];

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !isMuted;
    v.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const seekTo = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = sec;
    setCurrentTime(sec);
    if (v.paused) {
      void v.play();
      setIsPlaying(true);
    }
  };

  const openTheater = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    setTheaterOpen(true);
  };

  const closeTheater = () => {
    setTheaterOpen(false);
    if (videoRef.current) {
      void videoRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <>
      <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#070E1A] flex flex-col justify-between h-full">
        {/* 16:9 HD Walkthrough Video */}
        <div className="relative aspect-video w-full bg-slate-950 overflow-hidden flex-1">
          <video
            ref={videoRef}
            src="/src/assets/videos/champions_club_hero.mp4"
            poster="/src/assets/images/hero_tennis_club_1795254056266.jpg"
            autoPlay
            loop
            muted={isMuted}
            playsInline
            preload="auto"
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="w-full h-full object-cover"
          />

          {/* Top Media Controls */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
            <span className="px-2.5 py-1 rounded-md bg-slate-950/75 backdrop-blur-sm border border-white/15 text-[11px] font-mono text-lime-400">
              SITE WALKTHROUGH · 0:20
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause video' : 'Play video'}
                className="p-2 rounded-lg bg-slate-950/75 backdrop-blur-sm border border-white/15 text-white hover:bg-slate-900"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                className="p-2 rounded-lg bg-slate-950/75 backdrop-blur-sm border border-white/15 text-white hover:bg-slate-900"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={openTheater}
                aria-label="Expand walkthrough video"
                className="p-2 rounded-lg bg-slate-950/75 backdrop-blur-sm border border-white/15 text-white hover:bg-slate-900"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Clickable Chapter Scrubber Bar */}
        <div className="grid grid-cols-5 border-t border-slate-800 bg-[#0A1324] divide-x divide-slate-800">
          {CHAPTERS.map((chap) => {
            const isActive = activeChapter.id === chap.id;
            return (
              <button
                key={chap.id}
                type="button"
                onClick={() => seekTo(chap.startSec)}
                className={`px-2 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'bg-lime-400/15 text-lime-400'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="text-[10px] font-mono truncate font-semibold">{chap.label}</div>
                <div className="mt-1.5 h-0.5 w-full bg-slate-800 overflow-hidden rounded-full">
                  <div
                    className={`h-full transition-all duration-150 ${
                      isActive ? 'bg-lime-400' : currentTime >= chap.endSec ? 'bg-slate-500' : 'bg-transparent'
                    }`}
                    style={{
                      width: isActive
                        ? `${Math.min(100, Math.max(0, ((currentTime - chap.startSec) / (chap.endSec - chap.startSec)) * 100))}%`
                        : currentTime >= chap.endSec
                          ? '100%'
                          : '0%',
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded Theater Walkthrough Modal */}
      {theaterOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Alpha Sports Club Walkthrough Video"
        >
          <div className="w-full max-w-5xl space-y-3">
            <div className="flex items-center justify-between text-white">
              <div className="font-display font-semibold text-base">
                Alpha Sports Club — Platform &amp; Facility Walkthrough
              </div>
              <button
                type="button"
                onClick={closeTheater}
                aria-label="Close theater mode"
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-slate-700 bg-black aspect-video">
              <video
                ref={modalVideoRef}
                src="/src/assets/videos/champions_club_hero.mp4"
                poster="/src/assets/images/hero_tennis_club_1795254056266.jpg"
                controls
                autoPlay
                loop
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
