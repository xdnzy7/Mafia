import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Crown,
  Eye,
  HeartPulse,
  Moon,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
  Sunrise,
  Swords,
  Users,
  Vote,
  Volume2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { createSocket } from './socket';
import { SOCKET_EVENTS } from './shared/socketEvents';
import './styles.css';

const roomCode = 'MAFIA-729';

function Root() {
  const joinMatch = window.location.pathname.match(/^\/join\/([^/]+)\/?$/);

  if (joinMatch) {
    return <PlayerJoinPage roomCode={decodeURIComponent(joinMatch[1])} />;
  }

  return <App />;
}

function getPlayerSessionKey(roomCode) {
  return `mafia:player:${roomCode}`;
}

function savePlayerSession(roomCode, player) {
  try {
    window.sessionStorage.setItem(getPlayerSessionKey(roomCode), JSON.stringify(player));
  } catch (error) {
    console.error('Failed to save player session', error);
  }
}

function getPlayerSession(roomCode) {
  try {
    const stored = window.sessionStorage.getItem(getPlayerSessionKey(roomCode));
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Failed to read player session', error);
    return null;
  }
}

function waitForSocketConnection(socket, timeoutMs = 5000) {
  if (!socket) return Promise.reject(new Error('Socket has not been initialized.'));
  if (socket.connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Socket connection timed out.'));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
    };

    const handleConnect = () => {
      cleanup();
      resolve();
    };

    const handleConnectError = (error) => {
      cleanup();
      reject(error);
    };

    socket.once('connect', handleConnect);
    socket.once('connect_error', handleConnectError);
    socket.connect();
  });
}

function emitWithAck(socket, eventName, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

const roleMeta = {
  mafia: { label: 'مافيا', icon: Swords, team: 'mafia' },
  doctor: { label: 'طبيب', icon: HeartPulse, team: 'town' },
  detective: { label: 'محقق', icon: Eye, team: 'town' },
  citizen: { label: 'مواطن', icon: Shield, team: 'town' },
};

const initialConfig = {
  players: 8,
  mafia: 2,
  doctor: 1,
  detective: 1,
  citizen: 4,
  timers: {
    roleReveal: 8,
    night: 6,
    mafia: 15,
    doctor: 12,
    detective: 12,
    discussion: 25,
    voting: 18,
    elimination: 8,
  },
};

const initialNarrator = {
  enabled: true,
  volume: 1,
  rate: 0.88,
  pitch: 0.78,
};

const phaseMeta = {
  setup: { title: 'إعداد الجولة', label: 'إعداد', accent: 'purple', icon: Crown },
  waiting: { title: 'غرفة الانتظار', label: 'QR', accent: 'gold', icon: QrCode },
  roleReveal: { title: 'كشف الأدوار', label: 'الأدوار', accent: 'red', icon: Skull },
  night: { title: 'حل الظلام', label: 'الليل', accent: 'purple', icon: Moon },
  mafia: { title: 'المافيا تستيقظ', label: 'المافيا', accent: 'red', icon: Swords },
  doctor: { title: 'الطبيب يستيقظ', label: 'الطبيب', accent: 'emerald', icon: HeartPulse },
  detective: { title: 'المحقق يستيقظ', label: 'المحقق', accent: 'blue', icon: Eye },
  day: { title: 'أشرقت الشمس', label: 'النهار', accent: 'gold', icon: Sunrise },
  discussion: { title: 'النقاش', label: 'نقاش', accent: 'gold', icon: Activity },
  voting: { title: 'التصويت', label: 'تصويت', accent: 'red', icon: Vote },
  elimination: { title: 'كشف الإقصاء', label: 'إقصاء', accent: 'red', icon: Skull },
  victory: { title: 'النهاية', label: 'النصر', accent: 'gold', icon: Sparkles },
};

const accentMap = {
  red: {
    text: 'text-red-100',
    border: 'border-red-400/35',
    bg: 'from-red-950/60 via-black/55 to-purple-950/30',
    glow: 'shadow-[0_0_90px_rgba(239,68,68,.34)]',
    bar: 'from-red-300 via-amber-200 to-fuchsia-300',
  },
  gold: {
    text: 'text-amber-100',
    border: 'border-amber-300/35',
    bg: 'from-amber-950/50 via-black/55 to-purple-950/35',
    glow: 'shadow-[0_0_90px_rgba(245,158,11,.28)]',
    bar: 'from-amber-200 via-red-200 to-fuchsia-300',
  },
  purple: {
    text: 'text-fuchsia-100',
    border: 'border-fuchsia-300/35',
    bg: 'from-purple-950/60 via-black/55 to-red-950/25',
    glow: 'shadow-[0_0_90px_rgba(168,85,247,.3)]',
    bar: 'from-fuchsia-300 via-purple-200 to-red-300',
  },
  emerald: {
    text: 'text-emerald-100',
    border: 'border-emerald-300/35',
    bg: 'from-emerald-950/55 via-black/55 to-purple-950/25',
    glow: 'shadow-[0_0_90px_rgba(16,185,129,.25)]',
    bar: 'from-emerald-200 via-teal-200 to-amber-100',
  },
  blue: {
    text: 'text-sky-100',
    border: 'border-sky-300/35',
    bg: 'from-blue-950/55 via-black/55 to-purple-950/30',
    glow: 'shadow-[0_0_90px_rgba(59,130,246,.28)]',
    bar: 'from-sky-200 via-blue-200 to-fuchsia-300',
  },
};

function getArabicVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang?.toLowerCase().startsWith('ar')) ||
    voices.find((voice) => voice.name?.toLowerCase().includes('arabic')) ||
    voices.find((voice) => voice.lang?.toLowerCase().includes('ar')) ||
    voices[0] ||
    null
  );
}

function createNarrator(settings, setNarratorStatus, speechDelayRef) {
  const stopNarration = () => {
    if (speechDelayRef.current) {
      window.clearTimeout(speechDelayRef.current);
      speechDelayRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setNarratorStatus('متوقف');
    }
  };

  const speakArabic = (text) => {
    if (!settings.enabled) {
      setNarratorStatus('الصوت مغلق');
      return;
    }
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setNarratorStatus('المتصفح لا يدعم SpeechSynthesis');
      return;
    }

    stopNarration();
    window.speechSynthesis.resume();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getArabicVoice();
    utterance.lang = 'ar-SA';
    if (voice) utterance.voice = voice;
    utterance.volume = settings.volume;
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.onstart = () => setNarratorStatus(voice ? `يتحدث: ${voice.name}` : 'يتحدث بالصوت الافتراضي');
    utterance.onend = () => setNarratorStatus('جاهز');
    utterance.onerror = (event) => setNarratorStatus(`خطأ صوتي: ${event.error || 'غير معروف'}`);

    speechDelayRef.current = window.setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 90);
  };

  return {
    speakArabic,
    stopNarration,
    setEnabled: () => {},
    setVolume: () => {},
    setRate: () => {},
    setPitch: () => {},
  };
}

function App() {
  const socketRef = useRef(null);
  const [config, setConfig] = useState(initialConfig);
  const [narratorSettings, setNarratorSettings] = useState(initialNarrator);
  const [narratorStatus, setNarratorStatus] = useState('جاهز');
  const [voiceCount, setVoiceCount] = useState(0);
  const [phase, setPhase] = useState('setup');
  const [players, setPlayers] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [round, setRound] = useState(1);
  const [actions, setActions] = useState({ mafiaTarget: null, doctorProtect: null, detectiveCheck: null, votes: {} });
  const [nightResult, setNightResult] = useState(null);
  const [eliminated, setEliminated] = useState(null);
  const [winner, setWinner] = useState(null);
  const speechDelayRef = useRef(null);

  const meta = phaseMeta[phase];
  const theme = accentMap[meta.accent];
  const narrator = useMemo(() => createNarrator(narratorSettings, setNarratorStatus, speechDelayRef), [narratorSettings]);
  const joinedPlayers = players.filter((player) => !player.spectator);
  const alivePlayers = joinedPlayers.filter((player) => player.alive);
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) || null;
  const roleTotal = config.mafia + config.doctor + config.detective + config.citizen;
  const setupValidation = getSetupValidation(config, roleTotal);
  const canStartGame = setupValidation.canCreate && joinedPlayers.length === config.players;
  const duration = getPhaseDuration(phase, config);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.emit(SOCKET_EVENTS.HOST_JOIN, { roomCode });

    const syncRoomState = (state) => {
      if (state.config) setConfig(state.config);
      if (state.players) {
        setPlayers(state.players);
        setSelectedPlayerId((current) => current || state.players[0]?.id || null);
      }
      if (state.phase === 'waiting' || state.phase === 'roleReveal') {
        setPhase(state.phase);
      }
    };

    const syncPlayers = ({ players: nextPlayers }) => {
      setPlayers(nextPlayers);
      setSelectedPlayerId((current) => current || nextPlayers[0]?.id || null);
    };

    socket.on(SOCKET_EVENTS.ROOM_STATE_UPDATED, syncRoomState);
    socket.on(SOCKET_EVENTS.ROOM_PLAYERS_UPDATED, syncPlayers);

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_STATE_UPDATED, syncRoomState);
      socket.off(SOCKET_EVENTS.ROOM_PLAYERS_UPDATED, syncPlayers);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setNarratorStatus('المتصفح لا يدعم SpeechSynthesis');
      return undefined;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setVoiceCount(voices.length);
      if (voices.length > 0 && narratorStatus === 'جاهز') {
        setNarratorStatus(getArabicVoice() ? 'جاهز: تم العثور على صوت عربي' : 'جاهز: سيستخدم الصوت الافتراضي');
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (!duration) return undefined;
    setTimeLeft(duration);
    return undefined;
  }, [phase, duration, round]);

  useEffect(() => {
    if (phase === 'setup' || phase === 'waiting') return undefined;
    narrator.speakArabic(buildNarration(phase, nightResult, eliminated, winner));
    return () => narrator.stopNarration();
  }, [phase, round, narrator, nightResult, eliminated, winner]);

  useEffect(() => {
    if (!duration || paused || phase === 'victory') return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          advancePhase();
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase, paused, duration, actions, players, nightResult, eliminated, winner]);

  const updateConfig = (key, value) => {
    setConfig((current) => ({ ...current, [key]: clampNumber(value, key === 'players' ? 30 : 12) }));
  };

  const updateTimer = (key, value) => {
    setConfig((current) => ({
      ...current,
      timers: { ...current.timers, [key]: clampNumber(value, 300) },
    }));
  };

  const createRoom = () => {
    if (!setupValidation.canCreate) return;
    setPlayers([]);
    setSelectedPlayerId(null);
    setPhase('waiting');
    socketRef.current?.emit(SOCKET_EVENTS.ROOM_CREATE, { roomCode, config });
  };

  const joinPlayer = (name) => {
    const trimmed = name.trim();
    if (!trimmed || phase !== 'waiting') return;
    socketRef.current?.emit(SOCKET_EVENTS.PLAYER_JOIN, { roomCode, name: trimmed }, (response) => {
      if (response?.ok && response.player) {
        setSelectedPlayerId(response.player.id);
      }
    });
  };

  const startGame = () => {
    if (!canStartGame) return;
    socketRef.current?.emit(SOCKET_EVENTS.GAME_START, { roomCode, config });
    setActions({ mafiaTarget: null, doctorProtect: null, detectiveCheck: null, votes: {} });
    setNightResult(null);
    setEliminated(null);
    setWinner(null);
    setRound(1);
    setPaused(false);
  };

  const resetRoom = () => {
    narrator.stopNarration();
    setPhase('setup');
    setPlayers([]);
    setSelectedPlayerId(null);
    setActions({ mafiaTarget: null, doctorProtect: null, detectiveCheck: null, votes: {} });
    setNightResult(null);
    setEliminated(null);
    setWinner(null);
    setRound(1);
    setPaused(false);
  };

  const chooseAction = (type, targetId) => {
    setActions((current) => {
      if (type === 'vote') {
        if (!selectedPlayer?.id) return current;
        return { ...current, votes: { ...current.votes, [selectedPlayer.id]: targetId } };
      }
      return { ...current, [type]: targetId };
    });
  };

  const advancePhase = () => {
    setPhase((current) => {
      if (current === 'roleReveal') return 'night';
      if (current === 'night') return 'mafia';
      if (current === 'mafia') return 'doctor';
      if (current === 'doctor') return 'detective';
      if (current === 'detective') {
        resolveNight();
        return 'day';
      }
      if (current === 'day') return 'discussion';
      if (current === 'discussion') return 'voting';
      if (current === 'voting') {
        resolveVoting();
        return 'elimination';
      }
      if (current === 'elimination') {
        const result = getWinner(players);
        if (result) {
          setWinner(result);
          return 'victory';
        }
        setActions({ mafiaTarget: null, doctorProtect: null, detectiveCheck: null, votes: {} });
        setNightResult(null);
        setEliminated(null);
        setRound((value) => value + 1);
        return 'night';
      }
      return current;
    });
  };

  const resolveNight = () => {
    const targetId = actions.mafiaTarget;
    const protectedId = actions.doctorProtect;
    const victim = alivePlayers.find((player) => player.id === targetId);
    const saved = Boolean(targetId && targetId === protectedId);

    setNightResult({
      saved,
      victimName: victim?.name || null,
    });

    if (victim && !saved) {
      setPlayers((list) => list.map((player) => (player.id === victim.id ? { ...player, alive: false } : player)));
    }
  };

  const resolveVoting = () => {
    const tally = tallyVotes(actions.votes);
    const eliminatedId = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const target = alivePlayers.find((player) => player.id === eliminatedId) || null;
    setEliminated(target);
    if (target) {
      setPlayers((list) => list.map((player) => (player.id === target.id ? { ...player, alive: false } : player)));
    }
  };

  const phaseProgress = duration ? ((duration - timeLeft) / duration) * 100 : 0;

  return (
    <main dir="rtl" className={`relative min-h-screen overflow-hidden bg-black text-stone-50 ${theme.text}`}>
      <Atmosphere accent={meta.accent} />
      <div className="relative z-10 flex min-h-screen flex-col px-4 py-4 sm:px-6 lg:px-10">
        <CommandBar
          phase={phase}
          paused={paused}
          setPaused={setPaused}
          narrator={narrator}
          narratorSettings={narratorSettings}
          setNarratorSettings={setNarratorSettings}
          narratorStatus={narratorStatus}
          voiceCount={voiceCount}
          resetRoom={resetRoom}
          round={round}
        />

        <section className="grid flex-1 items-stretch gap-5 py-4 lg:grid-cols-[minmax(0,1fr)_430px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${phase}-${round}`}
              initial={{ opacity: 0, y: 34, scale: 0.98, filter: 'blur(16px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -22, scale: 0.98, filter: 'blur(12px)' }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            >
              <MainScreen
                phase={phase}
                meta={meta}
                theme={theme}
                config={config}
                updateConfig={updateConfig}
                updateTimer={updateTimer}
                setupValidation={setupValidation}
                players={players}
                joinedPlayers={joinedPlayers}
                alivePlayers={alivePlayers}
                createRoom={createRoom}
                startGame={startGame}
                canStartGame={canStartGame}
                narrator={narrator}
                narratorStatus={narratorStatus}
                timeLeft={timeLeft}
                duration={duration}
                phaseProgress={phaseProgress}
                nightResult={nightResult}
                eliminated={eliminated}
                winner={winner}
                actions={actions}
              />
            </motion.div>
          </AnimatePresence>

          <PhoneScreen
            phase={phase}
            theme={theme}
            players={players}
            selectedPlayer={selectedPlayer}
            selectedPlayerId={selectedPlayerId}
            setSelectedPlayerId={setSelectedPlayerId}
            joinPlayer={joinPlayer}
            actions={actions}
            chooseAction={chooseAction}
            timeLeft={timeLeft}
            config={config}
          />
        </section>
      </div>
    </main>
  );
}

function CommandBar({ phase, paused, setPaused, narrator, narratorSettings, setNarratorSettings, narratorStatus, voiceCount, resetRoom, round }) {
  const inGame = phase !== 'setup' && phase !== 'waiting' && phase !== 'victory';

  return (
    <header className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] px-3 py-2 lg:rounded-full">
      <div className="flex items-center gap-2">
        <button
          className="icon-button"
          onClick={() => setNarratorSettings((value) => ({ ...value, enabled: !value.enabled }))}
          aria-label="الصوت"
        >
          <Volume2 size={18} className={narratorSettings.enabled ? 'text-amber-100' : 'text-stone-500'} />
        </button>
        {inGame && (
          <button className="icon-button" onClick={() => setPaused((value) => !value)} aria-label="إيقاف مؤقت">
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
        )}
        <button className="icon-button" onClick={resetRoom} aria-label="إعادة ضبط">
          <RotateCcw size={18} />
        </button>
      </div>
      <div className="min-w-0 text-center">
        <div className="text-xs text-stone-400">المضيف الآلي يدير الجولة</div>
        <div className="truncate text-sm font-black text-white">الجولة {round} · {narratorStatus}</div>
      </div>
      <div className="grid w-full grid-cols-3 gap-2 text-xs lg:w-[360px]">
        <RangeControl label="الصوت" value={narratorSettings.volume} min={0} max={1} step={0.05} onChange={(value) => setNarratorSettings((current) => ({ ...current, volume: value }))} />
        <RangeControl label="السرعة" value={narratorSettings.rate} min={0.6} max={1.4} step={0.05} onChange={(value) => setNarratorSettings((current) => ({ ...current, rate: value }))} />
        <RangeControl label="النبرة" value={narratorSettings.pitch} min={0.5} max={1.5} step={0.05} onChange={(value) => setNarratorSettings((current) => ({ ...current, pitch: value }))} />
      </div>
      <button
        className="premium-button secondary w-full text-sm lg:w-auto"
        onClick={() => narrator.speakArabic(`اختبار الصوت. الأصوات المتاحة ${voiceCount}. أغمضوا أعينكم... المدينة تنام.`)}
      >
        اختبار الصوت
      </button>
    </header>
  );
}

function MainScreen(props) {
  const {
    phase,
    meta,
    theme,
    config,
    updateConfig,
    updateTimer,
    setupValidation,
    players,
    joinedPlayers,
    alivePlayers,
    createRoom,
    startGame,
    canStartGame,
    narrator,
    narratorStatus,
    timeLeft,
    duration,
    phaseProgress,
    nightResult,
    eliminated,
    winner,
    actions,
  } = props;
  const Icon = meta.icon;
  const roomUrl = `${window.location.origin}/join/${encodeURIComponent(roomCode)}`;

  if (phase === 'setup') {
    return (
      <section className={`cinema-panel border ${theme.border} bg-gradient-to-br ${theme.bg} ${theme.glow}`}>
        <div className="relative z-10 grid min-h-[700px] gap-6 xl:grid-cols-[1fr_430px]">
          <div className="flex flex-col justify-between">
            <div>
              <Pill icon={Crown} text="إعداد الجولة" border={theme.border} />
              <h1 className="mt-7 max-w-3xl text-6xl font-black leading-[1.05] text-white text-shadow sm:text-7xl lg:text-8xl">
                ليلة المافيا
              </h1>
              <p className="mt-6 max-w-2xl text-xl leading-9 text-stone-200/85">
                اضبط الأدوار والمؤقتات، ثم أنشئ الروم. لن يتم إنشاء أي لاعب أو توزيع أي دور قبل دخول اللاعبين الحقيقيين وبدء اللعبة.
              </p>
            </div>
            <SetupValidation validation={setupValidation} />
          </div>

          <div className="space-y-4">
            <div className="glass-card rounded-[1.7rem] p-4">
              <PanelTitle icon={Activity} title="إعدادات اللاعبين" subtitle="قبل إنشاء الروم" />
              <NumberField label="إجمالي اللاعبين" value={config.players} onChange={(value) => updateConfig('players', value)} />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <NumberField label="مافيا" value={config.mafia} onChange={(value) => updateConfig('mafia', value)} />
                <NumberField label="أطباء" value={config.doctor} onChange={(value) => updateConfig('doctor', value)} />
                <NumberField label="محققون" value={config.detective} onChange={(value) => updateConfig('detective', value)} />
                <NumberField label="مواطنون" value={config.citizen} onChange={(value) => updateConfig('citizen', value)} />
              </div>
            </div>
            <div className="glass-card rounded-[1.7rem] p-4">
              <PanelTitle icon={Moon} title="مؤقتات المراحل" subtitle="كل القيم بالثواني" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <NumberField label="كشف الدور" value={config.timers.roleReveal} onChange={(value) => updateTimer('roleReveal', value)} />
                <NumberField label="المافيا" value={config.timers.mafia} onChange={(value) => updateTimer('mafia', value)} />
                <NumberField label="الطبيب" value={config.timers.doctor} onChange={(value) => updateTimer('doctor', value)} />
                <NumberField label="المحقق" value={config.timers.detective} onChange={(value) => updateTimer('detective', value)} />
                <NumberField label="النقاش" value={config.timers.discussion} onChange={(value) => updateTimer('discussion', value)} />
                <NumberField label="التصويت" value={config.timers.voting} onChange={(value) => updateTimer('voting', value)} />
                <NumberField label="كشف الإقصاء" value={config.timers.elimination} onChange={(value) => updateTimer('elimination', value)} />
              </div>
              <button
                className="premium-button secondary mt-4 w-full"
                onClick={() => narrator.speakArabic('اختبار الصوت. أغمضوا أعينكم... المدينة تنام.')}
              >
                اختبار الصوت
              </button>
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-center text-sm text-stone-200">
                حالة الصوت: {narratorStatus}
              </div>
              <button disabled={!setupValidation.canCreate} onClick={createRoom} className="premium-button mt-3 w-full disabled:cursor-not-allowed disabled:opacity-40">
                إنشاء الروم وعرض QR
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (phase === 'waiting') {
    return (
      <section className={`cinema-panel border ${theme.border} bg-gradient-to-br ${theme.bg} ${theme.glow}`}>
        <div className="relative z-10 grid min-h-[700px] gap-6 xl:grid-cols-[420px_1fr]">
          <div className="glass-card flex flex-col items-center justify-center rounded-[1.7rem] p-4 text-center">
            <div className="qr-frame">
              <QRCodeSVG value={roomUrl} size={210} bgColor="transparent" fgColor="#fff7d6" />
            </div>
            <div className="mt-6 text-4xl font-black text-white">{roomCode}</div>
            <p className="mt-2 text-stone-300/75">كل لاعب يمسح الرمز ويدخل اسمه الحقيقي.</p>
          </div>
          <div className="flex flex-col justify-between">
            <div>
              <Pill icon={QrCode} text="بانتظار دخول اللاعبين عبر QR" border={theme.border} />
              <h1 className="mt-7 text-6xl font-black leading-[1.05] text-white text-shadow sm:text-7xl">
                {joinedPlayers.length}/{config.players}
              </h1>
              <p className="mt-5 max-w-2xl text-2xl leading-10 text-stone-100/85">
                زر البدء يبقى مقفلا حتى يدخل العدد المطلوب من اللاعبين الحقيقيين. الأدوار لم توزع بعد.
              </p>
            </div>

            <div>
              <WaitingList players={joinedPlayers} required={config.players} />
              <button disabled={!canStartGame} onClick={startGame} className="premium-button mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40">
                ابدأ اللعبة
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`cinema-panel border ${theme.border} bg-gradient-to-br ${theme.bg} ${theme.glow}`}>
      <div className="relative z-10 flex min-h-[700px] flex-col justify-between">
        <div>
          <Pill icon={Icon} text={meta.label} border={theme.border} />
          <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-6xl font-black leading-[1.05] text-white text-shadow sm:text-7xl lg:text-8xl">{meta.title}</h1>
              <p className="mt-5 max-w-3xl text-2xl leading-10 text-stone-100/85">
                {buildNarration(phase, nightResult, eliminated, winner)}
              </p>
            </div>
            {duration > 0 && <TimerOrb timeLeft={timeLeft} duration={duration} />}
          </div>
          {duration > 0 && (
            <div className="mt-8 h-3 overflow-hidden rounded-full bg-white/10">
              <motion.div className={`h-full rounded-full bg-gradient-to-l ${theme.bar}`} animate={{ width: `${phaseProgress}%` }} />
            </div>
          )}
        </div>

        <PhaseCenter
          phase={phase}
          players={players}
          alivePlayers={alivePlayers}
          nightResult={nightResult}
          eliminated={eliminated}
          winner={winner}
          actions={actions}
          config={config}
        />
      </div>
    </section>
  );
}

function PhoneScreen({ phase, theme, players, selectedPlayer, selectedPlayerId, setSelectedPlayerId, joinPlayer, actions, chooseAction, timeLeft, config }) {
  const alive = players.filter((player) => player.alive);
  const role = selectedPlayer?.role;
  const canMafia = phase === 'mafia' && role === 'mafia' && selectedPlayer?.alive;
  const canDoctor = phase === 'doctor' && role === 'doctor' && selectedPlayer?.alive;
  const canDetective = phase === 'detective' && role === 'detective' && selectedPlayer?.alive;
  const canVote = phase === 'voting' && selectedPlayer?.alive;
  const action = canMafia ? 'mafiaTarget' : canDoctor ? 'doctorProtect' : canDetective ? 'detectiveCheck' : null;
  const targets = getTargets(phase, alive, selectedPlayer);

  return (
    <aside className={`glass-panel relative min-h-[700px] overflow-hidden rounded-[2rem] border ${theme.border} p-4 ${theme.glow}`}>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.08),transparent_34%,rgba(0,0,0,.45))]" />
      <div className="relative z-10 flex h-full min-h-[660px] flex-col">
        <PanelTitle icon={Users} title="معاينة الهاتف" subtitle="محاكاة شاشة لاعب حقيقي" />

        {phase !== 'setup' && players.length > 0 && (
          <>
            <label className="mt-5 block text-xs text-stone-400">اختر هاتف لاعب دخل فعليا</label>
            <select
              value={selectedPlayerId || ''}
              onChange={(event) => setSelectedPlayerId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none"
            >
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="mt-5 flex-1">
          {phase === 'setup' && <PhoneIdle />}
          {phase === 'waiting' && <JoinScreen players={players} required={config.players} joinPlayer={joinPlayer} selectedPlayer={selectedPlayer} />}
          {phase === 'roleReveal' && <SecretRole selectedPlayer={selectedPlayer} />}
          {action && <ActionList phase={phase} action={action} targets={targets} selected={actions[action]} chooseAction={chooseAction} />}
          {canVote && <ActionList phase={phase} action="vote" targets={targets} selected={actions.votes[selectedPlayer.id]} chooseAction={chooseAction} />}
          {!['setup', 'waiting', 'roleReveal'].includes(phase) && !action && !canVote && <LockedPhone phase={phase} selectedPlayer={selectedPlayer} />}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="المطلوب" value={config.players} />
          <Metric label="المؤقت" value={timeLeft || '—'} />
          <Metric label="دخلوا" value={players.length} />
        </div>
      </div>
    </aside>
  );
}

function PlayerJoinPage({ roomCode }) {
  const [name, setName] = useState('');
  const [player, setPlayer] = useState(() => getPlayerSession(roomCode));
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const socketRef = useRef(null);
  const theme = accentMap.gold;

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const handleJoined = ({ player: joinedPlayer }) => {
      setPlayer(joinedPlayer);
      savePlayerSession(roomCode, joinedPlayer);
      setError('');
    };

    const handleRoleAssigned = ({ player: assignedPlayer }) => {
      setPlayer((current) => {
        if (current?.id !== assignedPlayer.id) return current;
        savePlayerSession(roomCode, assignedPlayer);
        return assignedPlayer;
      });
    };

    const handleConnectError = (connectError) => {
      console.error('Socket connection error', connectError);
    };

    socket.on(SOCKET_EVENTS.PLAYER_JOINED, handleJoined);
    socket.on(SOCKET_EVENTS.PLAYER_ROLE_ASSIGNED, handleRoleAssigned);
    socket.on('connect_error', handleConnectError);

    const restoredPlayer = getPlayerSession(roomCode);
    if (restoredPlayer?.name) {
      waitForSocketConnection(socket)
        .then(() => emitWithAck(socket, SOCKET_EVENTS.PLAYER_JOIN, { roomCode, name: restoredPlayer.name }))
        .then((response) => {
          if (response?.ok && response.player) {
            setPlayer(response.player);
            savePlayerSession(roomCode, response.player);
          } else {
            console.error('Player session restore rejected by server', { roomCode, response });
          }
        })
        .catch((restoreError) => {
          console.error('Player session restore failed', restoreError);
        });
    }

    return () => {
      socket.off(SOCKET_EVENTS.PLAYER_JOINED, handleJoined);
      socket.off(SOCKET_EVENTS.PLAYER_ROLE_ASSIGNED, handleRoleAssigned);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode]);

  const joinRoom = async () => {
    if (isSubmitting) return;

    const trimmed = name.trim();
    if (!trimmed) {
      const validationError = 'اكتب اسم اللاعب قبل الانضمام';
      console.error('Join validation failed', { roomCode, reason: validationError });
      setError(validationError);
      return;
    }

    if (trimmed.length < 2) {
      const validationError = 'اسم اللاعب يجب أن يكون حرفين على الأقل';
      console.error('Join validation failed', { roomCode, reason: validationError, name: trimmed });
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const socket = socketRef.current;
      await waitForSocketConnection(socket);
      const response = await emitWithAck(socket, SOCKET_EVENTS.PLAYER_JOIN, { roomCode, name: trimmed });

      if (!response?.ok) {
        const joinError = response?.message || 'تعذر الانضمام إلى الغرفة.';
        console.error('Player join rejected by server', { roomCode, name: trimmed, response });
        setError(joinError);
        return;
      }

      setPlayer(response.player);
      savePlayerSession(roomCode, response.player);
      setError('');
      setName('');
    } catch (joinError) {
      console.error('Player join failed', joinError);
      setError('تعذر الاتصال بسيرفر اللعبة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main dir="rtl" className={`relative min-h-screen overflow-hidden bg-black text-stone-50 ${theme.text}`}>
      <Atmosphere accent="gold" />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-6">
        <div className={`glass-panel w-full rounded-[2rem] border ${theme.border} p-5 ${theme.glow}`}>
          <div className="text-center">
            <QrCode className="mx-auto text-amber-100" size={48} />
            <div className="mt-5 text-xs text-stone-400">رمز الغرفة</div>
            <h1 className="mt-2 text-4xl font-black text-white">{roomCode}</h1>
          </div>

          {!player ? (
            <div className="mt-7">
              <label className="block">
                <span className="text-xs text-stone-400">اسم اللاعب</span>
                <input
                  value={name}
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (error) setError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') joinRoom();
                  }}
                  placeholder="اكتب اسمك"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-amber-200/50"
                />
              </label>
              <button
                disabled={isSubmitting}
                onClick={joinRoom}
                className="premium-button mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting ? 'جاري الانضمام...' : 'انضمام'}
              </button>
              {error && <p className="mt-3 text-center text-sm text-red-100">{error}</p>}
            </div>
          ) : player.role ? (
            <SecretRole selectedPlayer={player} />
          ) : (
            <div className="mt-7 rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
              <Shield className="mx-auto text-amber-100" size={46} />
              <div className="mt-4 text-3xl font-black text-white">{player.name}</div>
              <p className="mt-3 leading-8 text-stone-300">
                تم تسجيلك. انتظر بدء اللعبة. سيظهر دورك الخاص هنا بعد أن يبدأ المضيف الجولة.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function PhaseCenter({ phase, players, alivePlayers, nightResult, eliminated, winner, actions, config }) {
  if (phase === 'roleReveal') {
    return (
      <div className="grid gap-3 sm:grid-cols-4">
        {players.map((player, index) => (
          <motion.div key={player.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="glass-card rounded-3xl p-4 text-center">
            <Shield className="mx-auto text-amber-100" size={28} />
            <div className="mt-3 font-black text-white">{player.name}</div>
            <div className="text-xs text-stone-400">الدور يظهر على هاتف اللاعب فقط</div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (phase === 'night') return <MoonScene />;
  if (phase === 'day') return <Announcement nightResult={nightResult} />;
  if (phase === 'voting') return <VoteTally alivePlayers={alivePlayers} votes={actions.votes} />;
  if (phase === 'elimination') return <Elimination eliminated={eliminated} />;
  if (phase === 'victory') return <Victory winner={winner} />;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="الأحياء" value={alivePlayers.length} />
      <Metric label="اللاعبون" value={config.players} />
      <Metric label="الأفعال" value={Object.values(actions).filter(Boolean).length} />
    </div>
  );
}

function WaitingList({ players, required }) {
  return (
    <div className="glass-card rounded-[1.7rem] p-4">
      <PanelTitle icon={Users} title="قائمة الانتظار" subtitle={`${players.length}/${required}`} />
      {players.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-white/15 p-8 text-center text-stone-300">
          بانتظار دخول اللاعبين عبر QR
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {players.map((player, index) => (
            <motion.div key={player.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="glass-card rounded-2xl p-3 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/10 text-lg font-black text-amber-100">{player.name[0]}</div>
              <div className="mt-2 text-sm font-bold text-white">{player.name}</div>
              <div className="text-[11px] text-emerald-200">جاهز</div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function JoinScreen({ players, required, joinPlayer, selectedPlayer }) {
  const [name, setName] = useState('');
  const roomFull = players.length >= required;

  if (selectedPlayer) {
    return (
      <div className="glass-card rounded-3xl p-5 text-center">
        <Shield className="mx-auto text-amber-100" size={46} />
        <div className="mt-4 text-3xl font-black text-white">{selectedPlayer.name}</div>
        <p className="mt-3 leading-8 text-stone-300">تم تسجيلك. انتظر بدء اللعبة. لن يظهر دورك قبل أن يبدأ المضيف الجولة.</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-5">
      <QrCode className="text-amber-100" size={42} />
      <h3 className="mt-4 text-3xl font-black text-white">ادخل اسمك</h3>
      <p className="mt-2 leading-7 text-stone-300">{roomFull ? 'اكتمل عدد اللاعبين. لا يمكن الانضمام الآن.' : 'هذه شاشة اللاعب بعد مسح QR.'}</p>
      <input
        value={name}
        disabled={roomFull}
        onChange={(event) => setName(event.target.value)}
        placeholder="اسم اللاعب الحقيقي"
        className="mt-5 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-amber-200/50"
      />
      <button
        disabled={roomFull || !name.trim()}
        onClick={() => {
          joinPlayer(name);
          setName('');
        }}
        className="premium-button mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40"
      >
        انضمام
      </button>
    </div>
  );
}

function PhoneIdle() {
  return (
    <div className="glass-card rounded-3xl p-5 text-center">
      <QrCode className="mx-auto text-stone-300" size={46} />
      <p className="mt-4 leading-8 text-stone-300">بعد إنشاء الروم، تظهر هنا شاشة إدخال اسم اللاعب. لا توجد بيانات لاعب قبل الانضمام.</p>
    </div>
  );
}

function SecretRole({ selectedPlayer }) {
  if (!selectedPlayer?.role) {
    return (
      <div className="glass-card rounded-3xl p-5 text-center text-stone-300">
        اختر هاتفا للاعب دخل فعليا لعرض دوره الخاص.
      </div>
    );
  }
  const meta = roleMeta[selectedPlayer.role];
  const Icon = meta.icon;

  return (
    <motion.div initial={{ rotateY: 180, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.9 }} className="role-card mt-5 min-h-[360px]">
      <Icon size={70} className="text-red-200 drop-shadow-[0_0_28px_rgba(248,113,113,.85)]" />
      <div className="mt-6 text-sm tracking-[0.4em] text-red-100/70">سري</div>
      <div className="mt-3 text-5xl font-black text-white">{meta.label}</div>
    </motion.div>
  );
}

function ActionList({ phase, action, targets, selected, chooseAction }) {
  const copy = {
    mafia: 'اختر الضحية',
    doctor: 'اختر الحماية',
    detective: 'اختر التحقيق',
    voting: 'اختر صوتك',
  };

  return (
    <div className="mt-5">
      <div className="mb-3 text-sm text-stone-300">{copy[phase]}</div>
      <div className="space-y-3">
        {targets.map((target, index) => (
          <motion.button
            key={target.id}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => chooseAction(action, target.id)}
            className={`target-card ${selected === target.id ? 'selected-target' : ''}`}
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-xl font-black">{target.name[0]}</span>
            <span className="flex-1 text-right text-lg font-bold text-white">{target.name}</span>
            <Sparkles size={18} />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function LockedPhone({ phase, selectedPlayer }) {
  const text = !selectedPlayer
    ? 'اختر هاتفا للاعب دخل فعليا.'
    : selectedPlayer.alive === false
      ? 'خرجت من اللعبة. يمكنك المشاهدة فقط.'
      : phase === 'mafia'
        ? 'هذه المرحلة للمافيا فقط. انتظر بصمت.'
        : phase === 'doctor'
          ? 'هذه المرحلة للطبيب فقط. انتظر بصمت.'
          : phase === 'detective'
            ? 'هذه المرحلة للمحقق فقط. انتظر بصمت.'
            : 'لا يوجد إجراء مطلوب منك الآن.';

  return (
    <div className="glass-card mt-5 rounded-3xl p-5 text-center">
      <Moon className="mx-auto text-stone-300" size={42} />
      <p className="mt-4 leading-8 text-stone-200/80">{text}</p>
    </div>
  );
}

function SetupValidation({ validation }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="مجموع الأدوار" value={validation.roleTotal} />
      <Metric label="الحالة" value={validation.canCreate ? 'جاهز' : 'مرفوض'} />
      <div className={`glass-card rounded-2xl p-4 ${validation.canCreate ? 'text-emerald-100' : 'text-red-100'}`}>
        <div className="text-xs text-stone-300/70">التحقق</div>
        <div className="mt-1 text-lg font-black">{validation.message}</div>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs text-stone-400">{label}</span>
      <input
        min="0"
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-center text-2xl font-black text-white outline-none focus:border-amber-200/50"
      />
    </label>
  );
}

function RangeControl({ label, value, min, max, step, onChange }) {
  return (
    <label className="block rounded-2xl bg-white/5 px-3 py-2">
      <span className="text-stone-400">{label}</span>
      <input className="mt-1 w-full accent-amber-200" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Pill({ icon: Icon, text, border }) {
  return (
    <div className={`inline-flex items-center gap-3 rounded-full border ${border} bg-black/35 px-4 py-2 text-sm tracking-wide backdrop-blur-xl`}>
      <Icon size={18} />
      <span>{text}</span>
    </div>
  );
}

function TimerOrb({ timeLeft, duration }) {
  const percentage = Math.max(0, Math.min(100, (timeLeft / duration) * 100));

  return (
    <div className="timer-orb" style={{ '--timer': `${percentage}%` }}>
      <div className="text-5xl font-black text-white">{timeLeft}</div>
      <div className="text-xs text-stone-300">ثانية</div>
    </div>
  );
}

function PanelTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-xs text-stone-400">{subtitle}</div>
        <h2 className="mt-1 text-3xl font-black text-white">{title}</h2>
      </div>
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/10 text-amber-100">
        <Icon size={26} />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="text-xs text-stone-300/70">{label}</div>
      <div className="mt-1 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

function MoonScene() {
  return (
    <div className="relative mt-8 flex min-h-[280px] items-center justify-center overflow-hidden rounded-[1.5rem] bg-black/30">
      <motion.div animate={{ y: [0, 12, 0] }} transition={{ duration: 6, repeat: Infinity }} className="moon" />
      <div className="absolute bottom-8 text-center">
        <div className="text-3xl font-black text-white">المدينة تنام</div>
        <p className="mt-2 text-stone-300">كل الهواتف ستتغير تلقائيا حسب الدور.</p>
      </div>
    </div>
  );
}

function Announcement({ nightResult }) {
  return (
    <div className="relative mt-8 flex min-h-[280px] flex-col justify-end overflow-hidden rounded-[1.5rem] bg-gradient-to-b from-purple-950/30 via-red-950/20 to-amber-500/25 p-6 text-center">
      <motion.div initial={{ y: 120, opacity: 0.3 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 1.6 }} className="absolute bottom-12 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-amber-200 blur-sm shadow-[0_0_90px_rgba(251,191,36,.8)]" />
      <div className="relative z-10 text-4xl font-black text-white">
        {nightResult?.victimName ? (nightResult.saved ? 'لم يمت أحد هذه الليلة' : `خرج ${nightResult.victimName} من المدينة`) : 'مر الليل دون ضحية مؤكدة'}
      </div>
    </div>
  );
}

function VoteTally({ alivePlayers, votes }) {
  const tally = tallyVotes(votes);

  return (
    <div className="mt-8 space-y-4">
      {alivePlayers.map((player) => {
        const count = tally[player.id] || 0;
        return (
          <div key={player.id} className="glass-card rounded-3xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-bold text-white">{player.name}</span>
              <span className="text-red-100">{count} أصوات</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <motion.div animate={{ width: `${Math.min(100, count * 22)}%` }} className="h-full rounded-full bg-gradient-to-l from-red-300 via-amber-200 to-fuchsia-300 shadow-[0_0_18px_rgba(248,113,113,.85)]" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Elimination({ eliminated }) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center text-center">
      <motion.div initial={{ scale: 0.5, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 110, damping: 13 }} className="grid h-44 w-44 place-items-center rounded-full border border-red-200/30 bg-red-950/30 shadow-[0_0_90px_rgba(239,68,68,.45)]">
        <Skull size={82} className="text-red-100" />
      </motion.div>
      <div className="mt-7 text-5xl font-black text-white">{eliminated ? `خرج ${eliminated.name}` : 'لم يحسم التصويت'}</div>
      {eliminated && <p className="mt-4 text-xl text-red-100/80">كان {roleMeta[eliminated.role].label}</p>}
    </div>
  );
}

function Victory({ winner }) {
  const text = winner === 'mafia' ? 'فازت المافيا' : 'فازت المدينة';

  return (
    <div className="mt-8 flex flex-col items-center justify-center text-center">
      <motion.div animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.08, 1] }} transition={{ duration: 2.4, repeat: Infinity }}>
        <Crown size={116} className="text-amber-200 drop-shadow-[0_0_50px_rgba(252,211,77,.9)]" />
      </motion.div>
      <div className="mt-8 text-5xl font-black text-white">{text}</div>
      <p className="mt-4 text-xl text-stone-200/80">انتهى الحكم الآلي للجولة. يمكن للمضيف إعادة ضبط الغرفة فقط.</p>
    </div>
  );
}

function Atmosphere({ accent }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        id: index,
        right: `${(index * 17) % 100}%`,
        top: `${(index * 29) % 100}%`,
        delay: (index % 9) * 0.45,
        size: 2 + (index % 4),
      })),
    []
  );

  return (
    <div className={`atmosphere accent-${accent}`} aria-hidden="true">
      <div className="moon-glow" />
      <div className="vignette" />
      <div className="fog fog-a" />
      <div className="fog fog-b" />
      <div className="fog fog-c" />
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="particle"
          style={{
            right: particle.right,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            animationDelay: `${particle.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function getPhaseDuration(phase, config) {
  if (phase === 'night') return config.timers.night;
  return config.timers[phase] || 0;
}

function getSetupValidation(config, roleTotal) {
  if (roleTotal !== config.players) {
    return { canCreate: false, roleTotal, message: 'مجموع الأدوار يجب أن يساوي إجمالي اللاعبين' };
  }
  if (config.players < 4 || config.mafia < 1 || config.citizen < 1) {
    return { canCreate: false, roleTotal, message: 'تكوين الأدوار غير صالح' };
  }
  if (Object.values(config.timers).some((timer) => timer < 3)) {
    return { canCreate: false, roleTotal, message: 'كل مؤقت يجب أن يكون ٣ ثواني أو أكثر' };
  }
  return { canCreate: true, roleTotal, message: 'جاهز لإنشاء الروم' };
}

function clampNumber(value, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(max, parsed));
}

function assignRoles(list, config) {
  const roles = [
    ...Array.from({ length: config.mafia }, () => 'mafia'),
    ...Array.from({ length: config.doctor }, () => 'doctor'),
    ...Array.from({ length: config.detective }, () => 'detective'),
    ...Array.from({ length: config.citizen }, () => 'citizen'),
  ];

  return list.map((player, index) => ({
    ...player,
    role: roles[index],
    alive: true,
  }));
}

function getTargets(phase, alive, selectedPlayer) {
  if (!selectedPlayer) return [];
  if (phase === 'mafia') return alive.filter((player) => player.role !== 'mafia');
  if (phase === 'doctor') return alive;
  if (phase === 'detective') return alive.filter((player) => player.id !== selectedPlayer.id);
  if (phase === 'voting') return alive.filter((player) => player.id !== selectedPlayer.id);
  return [];
}

function tallyVotes(votes) {
  return Object.values(votes).reduce((acc, targetId) => {
    acc[targetId] = (acc[targetId] || 0) + 1;
    return acc;
  }, {});
}

function getWinner(list) {
  const alive = list.filter((player) => player.alive);
  const mafia = alive.filter((player) => player.role === 'mafia').length;
  const town = alive.length - mafia;
  if (mafia === 0) return 'town';
  if (mafia >= town) return 'mafia';
  return null;
}

function buildNarration(phase, nightResult, eliminated, winner) {
  if (phase === 'roleReveal') return 'انظر إلى هاتفك فقط. لا تكشف دورك لأحد.';
  if (phase === 'night') return 'أغمضوا أعينكم... المدينة تنام.';
  if (phase === 'mafia') return 'المافيا... افتحوا أعينكم. اختاروا ضحيتكم.';
  if (phase === 'doctor') return 'المافيا... أغمضوا أعينكم. الطبيب... افتح عينيك. اختر شخصاً لحمايته.';
  if (phase === 'detective') return 'الطبيب... أغمض عينيك. المحقق... افتح عينيك. اختر شخصاً للتحقيق.';
  if (phase === 'day') {
    const result = nightResult?.victimName
      ? nightResult.saved
        ? 'لم يمت أحد هذه الليلة.'
        : `خرج ${nightResult.victimName} من المدينة.`
      : 'لم تحدث وفاة مؤكدة هذه الليلة.';
    return `المحقق... أغمض عينيك. أشرقت الشمس. ${result}`;
  }
  if (phase === 'discussion') return 'ابدأوا النقاش. راقبوا التردد وتغير القصص.';
  if (phase === 'voting') return 'حان وقت التصويت. اختاروا من سيغادر المدينة.';
  if (phase === 'elimination') {
    return eliminated ? `تم إقصاء ${eliminated.name}. كان دوره ${roleMeta[eliminated.role].label}.` : 'لم يتم إقصاء أي لاعب في هذا التصويت.';
  }
  if (phase === 'victory') {
    return winner === 'mafia' ? 'انتهت اللعبة. المافيا سيطرت على المدينة.' : 'انتهت اللعبة. المدينة كشفت كل أفراد المافيا.';
  }
  return '';
}

createRoot(document.getElementById('root')).render(<Root />);
