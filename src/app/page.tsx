'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import useSound from 'use-sound';

const bannerTexts = [
  "WIN $1,000,000 NOW!!!",
  "HOT SINGLES IN YOUR AREA",
  "CONGRATULATIONS! YOU'RE THE 1,000,000th VISITOR!",
  "CLICK HERE FOR FREE SCREENSAVERS",
  "DOWNLOAD MORE RAM",
  "YOU HAVE 3 NEW MESSAGES",
  "DOCTORS HATE THIS ONE TRICK",
  "FREE RINGTONES! CLICK NOW!",
  "MORTGAGE RATES AT ALL TIME LOW",
  "LOSE 30 POUNDS IN 30 DAYS",
  "MEET RUSSIAN BRIDES",
  "YOUR COMPUTER MAY BE AT RISK",
  "CLAIM YOUR FREE iPHONE",
  "CASINO - WIN BIG $$$",
  "WORK FROM HOME - EARN $5000/WEEK",
  "ENLARGE YOUR... BANK ACCOUNT",
  "FREE VACATION TO HAWAII",
  "MYSTERY SHOPPER NEEDED",
  "CONGRATULATIONS! YOU WON!",
  "CLICK HERE! CLICK HERE! CLICK HERE!",
  "AS SEEN ON TV",
  "MAKE MONEY FAST!!!",
  "FREE GIFT CARDS",
  "VIRUS DETECTED! CLICK NOW!",
  "AMAZING WEIGHT LOSS PILLS",
  "GET RICH QUICK SCHEME",
  "NIGERIAN PRINCE NEEDS YOUR HELP",
  "FREE TOOLBAR DOWNLOAD",
  "PUNCH THE MONKEY TO WIN",
  "YOU ARE THE CHOSEN ONE",
  "URGENT: VERIFY YOUR ACCOUNT",
  "FREE FREE FREE FREE FREE",
  "MILLIONAIRE SECRETS REVEALED",
  "CHEAP VIAGRA ONLINE",
  "CONGRATULATIONS WINNER!!!",
  "EARN $$$ WHILE YOU SLEEP",
  "ONE WEIRD TRICK",
  "BANKS HATE HIM",
  "SHOCKING VIDEO",
  "YOU WON'T BELIEVE WHAT HAPPENS NEXT",
  "LIMITED TIME OFFER!!!",
  "ACT NOW! SUPPLIES LIMITED!",
  "CALL NOW! 1-800-SCAM",
  "FREE PSYCHIC READING",
  "LUCKY WINNER SELECTED",
  "INCREASE YOUR IQ BY 50 POINTS",
  "GOVERNMENT GRANTS AVAILABLE",
  "SEXY WEBCAMS LIVE NOW",
  "DOWNLOAD ACCELERATOR PRO",
  "CONGRATULATIONS ON YOUR WIN",
  "FREE MEMBERSHIP - JOIN NOW",
  "INVEST IN BEANIE BABIES",
  "Y2K SURVIVAL KIT",
  "FREE AOL CD-ROM",
  "NETSCAPE NAVIGATOR DOWNLOAD",
  "DANCING BABY SCREENSAVER",
  "HAMSTER DANCE RINGTONE",
  "FREE GEOCITIES HOSTING",
  "WEBRING - JOIN NOW",
  "ICQ MESSAGE WAITING",
  "NAPSTER PREMIUM ACCESS",
  "WINAMP SKINS COLLECTION",
  "FREE REALPLAYER DOWNLOAD",
  "BONZI BUDDY WANTS TO HELP",
  "COMET CURSOR - JAZZ UP YOUR MOUSE",
  "FREE MIDI FILES",
  "ALTAVISTA SEARCH TOOLBAR",
  "LYCOS HOMEPAGE BUILDER",
  "ASKJEEVES KNOWS THE ANSWER",
  "FRIENDSTER FRIEND REQUEST",
  "MYSPACE TOP 8 NOTIFICATION",
  "LIMEWIRE PRO VERSION",
  "KAZAA UNLIMITED DOWNLOADS",
  "FREE EMOTICONS PACK",
  "MSN MESSENGER PLUS",
  "YAHOO! CHAT ROOMS",
  "ANGELFIRE WEBSITE HOSTING",
  "TRIPOD FREE HOSTING",
  "XANGA BLOG COMMENTS",
  "LIVEJOURNAL MOOD THEMES",
  "NEOPETS RARE ITEMS",
  "EBAUMSWORLD FUNNY VIDEOS",
  "NEWGROUNDS FLASH GAMES",
  "ALBINOBLACKSHEEP ANIMATIONS",
  "HOMESTAR RUNNER NEW EPISODE",
  "STRONG BAD EMAIL",
  "ALL YOUR BASE ARE BELONG TO US",
  "FREE DOOM SHAREWARE",
  "DUKE NUKEM FOREVER PREORDER",
  "HALF-LIFE 3 CONFIRMED",
  "FREE QUAKE MODS",
  "COUNTER-STRIKE BETA ACCESS",
  "DIABLO ITEM DUPLICATION",
  "STARCRAFT CHEAT CODES",
  "POKEMON RARE CANDY HACK",
  "TAMAGOTCHI VIRTUAL PET",
  "FURBY LEARNS YOUR NAME",
  "BEANIE BABY VALUE GUIDE",
  "POGS TOURNAMENT WINNER",
  "FREE BLOCKBUSTER RENTAL"
];

export default function Home() {
  const [showClown, setShowClown] = useState(false);
  const [showLove, setShowLove] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [banners, setBanners] = useState<Array<{id: number, text: string, position: string}>>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [playFart] = useSound('/fart.mp3', { volume: 0.5 });

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % 100);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const newBanners = [];
    for (let i = 0; i < 10; i++) {
      const bannerIndex = (currentBannerIndex + i) % 100;
      newBanners.push({
        id: bannerIndex,
        text: bannerTexts[bannerIndex],
        position: `${Math.random() * 80}% ${Math.random() * 80}%`
      });
    }
    setBanners(newBanners);
  }, [currentBannerIndex]);

  const handleFart = () => {
    try {
      playFart?.();
    } catch (e) {
      // Fallback: Create fart sound with Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.3);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    }
  };

  const handleClown = () => {
    setShowClown(true);
    setTimeout(() => setShowClown(false), 1000);
  };

  const handleLove = () => {
    setShowLove(true);
    setTimeout(() => setShowLove(false), 3000);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleBannerClose = (e: React.MouseEvent, bannerId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 relative overflow-hidden">
      <div className="flex flex-col items-center justify-center min-h-screen gap-8 z-10 relative">
        <div className="grid grid-cols-2 gap-6">
          <button
            onClick={handleFart}
            className="px-8 py-6 bg-yellow-400 hover:bg-yellow-500 text-black font-bold text-2xl rounded-xl transform hover:scale-105 transition-all shadow-lg border-4 border-yellow-600"
          >
            💨 MAKE FART
          </button>
          
          <button
            onClick={handleClown}
            className="px-8 py-6 bg-red-500 hover:bg-red-600 text-white font-bold text-2xl rounded-xl transform hover:scale-105 transition-all shadow-lg border-4 border-red-700"
          >
            🤡 SUMMON CLOWN
          </button>
          
          <button
            onClick={handleLove}
            className="px-8 py-6 bg-pink-400 hover:bg-pink-500 text-white font-bold text-2xl rounded-xl transform hover:scale-105 transition-all shadow-lg border-4 border-pink-600"
          >
            💖 FEEL LOVED
          </button>
          
          <button
            onClick={handleRefresh}
            className="px-8 py-6 bg-blue-500 hover:bg-blue-600 text-white font-bold text-2xl rounded-xl transform hover:scale-105 transition-all shadow-lg border-4 border-blue-700"
          >
            🔄 REFRESH PAGE
          </button>
        </div>
      </div>

      {showClown && (
        <div className="fixed inset-0 z-[200] pointer-events-none bg-black">
          <Image
            src="/clown.png"
            alt="Clown"
            fill
            className="object-cover"
            priority
          />
        </div>
      )}

      {showLove && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-pink-200 p-12 rounded-3xl animate-pulse shadow-2xl border-8 border-pink-400">
            <h2 className="text-5xl font-bold text-pink-800">
              ❤️ YOU ARE LOVED! ❤️
            </h2>
            <p className="text-2xl text-pink-700 mt-4 text-center">
              You are amazing and special! 🌟
            </p>
          </div>
        </div>
      )}

      {banners.map((banner) => (
        <div
          key={banner.id}
          className="absolute animate-pulse"
          style={{
            left: banner.position.split(' ')[0],
            top: banner.position.split(' ')[1],
            animation: `blink ${1 + Math.random() * 2}s infinite`
          }}
        >
          <a
            href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            target="_blank"
            rel="noopener noreferrer"
            className="block relative group"
          >
            <div className={`
              px-4 py-2 text-xs font-bold border-4 shadow-lg
              ${banner.id % 5 === 0 ? 'bg-yellow-300 border-red-600 text-red-900' :
                banner.id % 5 === 1 ? 'bg-lime-400 border-blue-600 text-blue-900' :
                banner.id % 5 === 2 ? 'bg-orange-400 border-green-600 text-green-900' :
                banner.id % 5 === 3 ? 'bg-cyan-300 border-purple-600 text-purple-900' :
                'bg-pink-300 border-yellow-600 text-yellow-900'}
              ${banner.id % 3 === 0 ? 'animate-spin' : ''}
              ${banner.id % 7 === 0 ? 'text-lg' : ''}
            `}>
              {banner.text}
            </div>
            <button
              onClick={(e) => handleBannerClose(e, banner.id)}
              className="absolute -top-2 -right-2 bg-red-600 text-white w-6 h-6 rounded-full text-xs font-bold hover:bg-red-800 border-2 border-white"
            >
              X
            </button>
          </a>
        </div>
      ))}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100]">
          <div className="bg-white p-8 rounded-lg max-w-md animate-bounce">
            <h2 className="text-3xl font-bold mb-4 text-red-600">
              🚨 WAIT! DON'T GO! 🚨
            </h2>
            <p className="text-xl mb-4">
              Subscribe for only $2.99/month!
            </p>
            <p className="text-lg mb-4">
              Or ship Bitcoin to these coordinates:
            </p>
            <p className="font-mono bg-gray-200 p-2 rounded mb-6">
              37.2431° N, 115.7930° W
            </p>
            <button
              onClick={() => setShowModal(false)}
              className="w-full bg-blue-500 text-white py-3 rounded font-bold hover:bg-blue-600"
            >
              NO THANKS, I HATE FUN
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes blink {
          0%, 50%, 100% { opacity: 1; }
          25%, 75% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}