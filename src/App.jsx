import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import InteractiveBoard from './components/InteractiveBoard';

const API_URL = import.meta.env.VITE_API_URL || 'https://doublelang-backend.onrender.com';
const pcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const FONT = "'Montserrat', Arial, sans-serif";

const C = {
  blue: '#74abe9', navy: '#252641', teal: '#21747a',
  bg: '#f2f6ff', card: '#fff', text: '#252641', sub: '#9ca3af',
  border: '#e5e7eb', success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
  activeItem: '#e8f3fd', activeTxt: '#74abe9',
};

// ── Утилиты ──────────────────────────────────────────────────────────────────
const Badge = ({ label, color, bg }) => (
  <span style={{ padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', color, background: bg }}>{label}</span>
);
const StatCard = ({ icon, value, label, color }) => (
  <div style={{ background: C.card, borderRadius: '12px', padding: '18px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '14px' }}>
    <div style={{ width: '44px', height: '44px', borderRadius: '11px', background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px' }}>{icon}</div>
    <div><div style={{ fontSize: '24px', fontWeight: '700', color: C.text, lineHeight: 1 }}>{value}</div><div style={{ fontSize: '12px', color: C.sub, marginTop: '3px' }}>{label}</div></div>
  </div>
);
const SearchBar = ({ placeholder, value, onChange }) => (
  <div style={{ position: 'relative', flex: 1 }}>
    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: C.sub, fontSize: '14px' }}>🔍</span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: FONT, color: C.text, outline: 'none', background: '#fff', boxSizing: 'border-box' }} />
  </div>
);
const Tabs = ({ tabs, active, onChange }) => (
  <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
    {tabs.map(t => (
      <button key={t} onClick={() => onChange(t)} style={{ padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '13px', fontFamily: FONT, fontWeight: active === t ? '600' : '400', background: active === t ? C.blue : 'transparent', color: active === t ? '#fff' : C.sub, transition: 'all 0.12s' }}>{t}</button>
    ))}
  </div>
);


// ── Каталог материалов (статичный) ───────────────────────────────────────────
const CATALOG = [
  { title: 'Placement Test', level: 'A1-C2', color: '#4f46e5', emoji: '📋', tag: 'Тест' },
  { title: 'Present Simple', level: 'A1', color: '#10b981', emoji: '📖', tag: 'Грамматика' },
  { title: 'Speaking Club', level: 'B1/B2', color: '#f59e0b', emoji: '🗣️', tag: 'Разговор' },
  { title: 'Business English', level: 'B2/C1', color: '#6495ed', emoji: '💼', tag: 'Бизнес' },
  { title: 'IELTS Preparation', level: 'B2+', color: '#ef4444', emoji: '🎓', tag: 'Экзамен' },
  { title: 'Vocabulary Builder', level: 'A2/B1', color: '#8b5cf6', emoji: '📚', tag: 'Лексика' },
  { title: 'Pronunciation', level: 'A1-B2', color: '#ec4899', emoji: '🎤', tag: 'Произношение' },
  { title: 'Reading Skills', level: 'A2-B2', color: '#14b8a6', emoji: '📰', tag: 'Чтение' },
];

// ── Меню ─────────────────────────────────────────────────────────────────────
const MENUS = {
  teacher: [
    { key: 'classes',   icon: '🎓', label: 'Классы' },
    { key: 'students',  icon: '👤', label: 'Ученики' },
    { key: 'materials', icon: '📖', label: 'Материалы' },
    { key: 'schedule',  icon: '📅', label: 'Расписание' },
    { key: 'settings',  icon: '⚙️', label: 'Настройки' },
  ],
  student: [
    { key: 'dashboard', icon: '⊞', label: 'Главная' },
    { key: 'lessons',   icon: '📋', label: 'Мои уроки' },
    { key: 'homework',  icon: '📝', label: 'Домашние задания' },
  ],
  admin: [
    { key: 'stats',     icon: '⊞', label: 'Показатели' },
    { key: 'students',  icon: '🧑‍🎓', label: 'Ученики' },
    { key: 'teachers',  icon: '👨‍🏫', label: 'Сотрудники' },
    { key: 'lessons',   icon: '📋', label: 'Все уроки' },
    { key: 'settings',  icon: '⚙️', label: 'Настройки' },
  ],
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => { const s = localStorage.getItem('doublelang_user'); return s ? JSON.parse(s) : null; });
  const [role, setRole] = useState(() => { const s = localStorage.getItem('doublelang_user'); return s ? JSON.parse(s).role : null; });
  const [roomId, setRoomId] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const myVideo = useRef();
  const peerConnections = useRef({});
  const streamRef = useRef(null);
  const chatEndRef = useRef(null);

  const [section, setSection] = useState('classes');
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Data
  const [lessons, setLessons] = useState([]);
  const [users, setUsers] = useState([]);
  const [hw, setHw] = useState([]);
  const [studentHw, setStudentHw] = useState([]);
  const [scheduleData, setScheduleData] = useState([]);
  const [hwForm, setHwForm] = useState({ email: '', title: '' });

  // UI state
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Все');
  const [materialsTab, setMaterialsTab] = useState('Каталог');
  const [scheduleForm, setScheduleForm] = useState({ title: '', student_email: '', lesson_date: '', start_time: '09:00', end_time: '10:00' });
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [settingsView, setSettingsView] = useState(null);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', about: '', language: '', timezone: 'UTC+3' });
  const [weekOffset, setWeekOffset] = useState(0);

  // Auth
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'student' });

  // Styles
  const S = {
    inp: { padding: '10px 13px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '14px', outline: 'none', width: '100%', fontFamily: FONT, color: C.text, background: '#fff', boxSizing: 'border-box' },
    btn: (bg = C.blue) => ({ padding: '9px 18px', background: bg, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', fontFamily: FONT }),
    btnOut: { padding: '8px 16px', background: 'transparent', color: C.blue, border: `1px solid ${C.blue}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', fontFamily: FONT },
    card: { background: C.card, borderRadius: '12px', padding: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', border: `1px solid ${C.border}` },
    filterBtn: { padding: '8px 14px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: '8px', cursor: 'pointer', fontFamily: FONT, fontSize: '13px', color: C.sub, display: 'flex', alignItems: 'center', gap: '6px' },
  };

  const authHeaders = () => {
    const token = localStorage.getItem('doublelang_token');
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  // Load data
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('lesson');
    if (room) { setRoomId(room); return; }
    if (!currentUser) return;
    const role = currentUser.role;
    if (role === 'teacher' || role === 'admin') {
      fetch(`${API_URL}/api/users`, { headers: authHeaders() }).then(r => r.json()).then(d => Array.isArray(d) ? setUsers(d) : null).catch(() => {});
    }
    if (role === 'teacher') {
      fetch(`${API_URL}/api/lessons`, { headers: authHeaders() }).then(r => r.json()).then(d => Array.isArray(d) ? setLessons(d) : null).catch(() => {});
      fetch(`${API_URL}/api/homework/teacher`, { headers: authHeaders() }).then(r => r.json()).then(d => Array.isArray(d) ? setHw(d) : null).catch(() => {});
      fetch(`${API_URL}/api/schedule`, { headers: authHeaders() }).then(r => r.json()).then(d => Array.isArray(d) ? setScheduleData(d) : null).catch(() => {});
      fetch(`${API_URL}/api/profile/${currentUser.id}`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => d && setProfileForm({ name: d.name || '', phone: d.phone || '', about: d.about || '', language: d.language || '', timezone: d.timezone || 'UTC+3' }))
        .catch(() => setProfileForm({ name: currentUser.name, phone: '', about: '', language: '', timezone: 'UTC+3' }));
    }
    if (role === 'admin') {
      fetch(`${API_URL}/api/lessons`, { headers: authHeaders() }).then(r => r.json()).then(d => Array.isArray(d) ? setLessons(d) : null).catch(() => {});
    }
    if (role === 'student') {
      fetch(`${API_URL}/api/homework/student`, { headers: authHeaders() }).then(r => r.json()).then(d => Array.isArray(d) ? setHw(d) : null).catch(() => {});
      setSection('dashboard');
    }
    if (role === 'admin') setSection('stats');
  }, [currentUser]);

  useEffect(() => {
    if (!selectedStudent) return;
    fetch(`${API_URL}/api/homework/student-by-email?email=${selectedStudent.email}`, { headers: authHeaders() }).then(r => r.json()).then(d => Array.isArray(d) ? setStudentHw(d) : null).catch(() => {});
  }, [selectedStudent]);

  const createPeer = useCallback((sk, remoteSocketId) => {
    const pc = new RTCPeerConnection(pcConfig);
    peerConnections.current[remoteSocketId] = pc;
    pc.onicecandidate = e => e.candidate && sk.emit('webrtc_ice_candidate', e.candidate, remoteSocketId);
    pc.ontrack = e => setRemoteStreams(prev => ({ ...prev, [remoteSocketId]: e.streams[0] }));
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current));
    }
    return pc;
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const token = localStorage.getItem('doublelang_token');
    const sk = io(API_URL, { auth: { token } });
    setSocket(sk);

    sk.on('connect_error', err => console.warn('Socket auth error:', err.message));
    sk.emit('join_room', roomId);
    sk.emit('load_board');

    sk.on('update_board', b => setBlocks(b || []));
    sk.on('load_board', b => b && setBlocks(b));

    sk.on('system_message', msg => setChatMessages(prev => [...prev, { type: 'system', text: msg }]));
    sk.on('new_chat_message', msg => setChatMessages(prev => [...prev, { type: 'user', ...msg }]));

    sk.on('user_joined', async remoteSocketId => {
      const pc = createPeer(sk, remoteSocketId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sk.emit('webrtc_offer', offer, remoteSocketId);
    });

    sk.on('webrtc_offer', async (offer, remoteSocketId) => {
      const pc = createPeer(sk, remoteSocketId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sk.emit('webrtc_answer', answer, remoteSocketId);
    });

    sk.on('webrtc_answer', async (answer, remoteSocketId) => {
      const pc = peerConnections.current[remoteSocketId];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    sk.on('webrtc_ice_candidate', async (candidate, remoteSocketId) => {
      const pc = peerConnections.current[remoteSocketId];
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    sk.on('user_disconnected', remoteSocketId => {
      peerConnections.current[remoteSocketId]?.close();
      delete peerConnections.current[remoteSocketId];
      setRemoteStreams(prev => { const s = { ...prev }; delete s[remoteSocketId]; return s; });
    });

    return () => {
      Object.values(peerConnections.current).forEach(p => p.close());
      peerConnections.current = {};
      sk.disconnect();
    };
  }, [roomId, currentUser, createPeer]);

  const handleAuth = async e => {
    e.preventDefault();
    const res = await fetch(`${API_URL}${authMode === 'login' ? '/api/login' : '/api/register'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authForm) });
    const d = await res.json();
    if (d.token) { setCurrentUser(d.user); setRole(d.user.role); localStorage.setItem('doublelang_user', JSON.stringify(d.user)); localStorage.setItem('doublelang_token', d.token); }
    else if (d.id) { alert('Успешно! Войдите.'); setAuthMode('login'); }
    else alert(d.error);
  };

  const logout = () => { setCurrentUser(null); setRole(null); localStorage.clear(); window.location.href = '/'; };
  const joinLesson = id => { if (!id) return; window.history.pushState(null, null, '?lesson=' + id); setRoomId(id); };
  const createLesson = () => joinLesson(Math.random().toString(36).substring(7));
  const addBlock = type => { const nb = [...blocks, { id: Date.now(), type, content: type === 'quiz' ? { question: '', options: ['', '', '', ''], correctAnswer: 0, studentAnswer: null } : '' }]; setBlocks(nb); socket.emit('board_change', nb); };
  const clearBoard = () => { setBlocks([]); socket.emit('board_change', []); };
  const updBlock = (id, v) => { const nb = blocks.map(b => b.id === id ? { ...b, content: v } : b); setBlocks(nb); socket.emit('board_change', nb); };
  const updQuiz = (id, f, v) => { const nb = blocks.map(b => b.id === id ? { ...b, content: { ...b.content, [f]: v } } : b); setBlocks(nb); socket.emit('board_change', nb); };
  const assignHw = async e => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/api/homework/assign`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ student_email: hwForm.email, title: hwForm.title, board_content: [{ id: Date.now(), type: 'text', content: '' }] }) });
    if (res.ok) {
      alert('ДЗ отправлено!');
      setHwForm({ email: '', title: '' });
      fetch(`${API_URL}/api/homework/teacher`, { headers: authHeaders() }).then(r => r.json()).then(d => Array.isArray(d) ? setHw(d) : null);
    } else {
      const d = await res.json();
      alert(d.error || 'Ошибка');
    }
  };
  const turnOnCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      streamRef.current = stream;
      if (myVideo.current) myVideo.current.srcObject = stream;
      // Добавляем треки в уже существующие соединения
      Object.values(peerConnections.current).forEach(pc => {
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
      });
    } catch (err) { console.error(err); alert('Не удалось открыть камеру: ' + err.message); }
  };

  const toggleMic = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMicMuted(!track.enabled); }
  };

  const toggleCamera = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsCameraOff(!track.enabled); }
  };

  const sendChat = e => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('chat_message', chatInput.trim());
    setChatInput('');
  };

  const addSchedule = async e => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/api/schedule`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(scheduleForm) });
    if (res.ok) {
      setShowScheduleForm(false);
      setScheduleForm({ title: '', student_email: '', lesson_date: '', start_time: '09:00', end_time: '10:00' });
      fetch(`${API_URL}/api/schedule`, { headers: authHeaders() }).then(r => r.json()).then(d => Array.isArray(d) ? setScheduleData(d) : null);
    } else {
      const d = await res.json();
      alert(d.error || 'Ошибка');
    }
  };

  const deleteSchedule = async id => {
    await fetch(`${API_URL}/api/schedule/${id}`, { method: 'DELETE', headers: authHeaders() });
    setScheduleData(prev => prev.filter(s => s.id !== id));
  };

  const saveProfile = async e => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/api/profile/${currentUser.id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(profileForm) });
    if (res.ok) {
      const updated = { ...currentUser, ...profileForm };
      setCurrentUser(updated);
      localStorage.setItem('doublelang_user', JSON.stringify(updated));
      alert('Профиль обновлён!');
    } else {
      const d = await res.json();
      alert(d.error || 'Ошибка');
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const students = users.filter(u => u.role === 'student');
  const teachers = users.filter(u => u.role === 'teacher');

  // ── AUTH ──────────────────────────────────────────────────────────────────
  if (!currentUser && !roomId) return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: FONT }}>
      <div style={{ width: '44%', background: C.navy, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px' }}>
        <div style={{ maxWidth: '320px', width: '100%' }}>
          <div style={{ color: C.blue, fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '14px' }}>DoubleLang</div>
          <h1 style={{ fontSize: '34px', fontWeight: '800', color: '#fff', margin: '0 0 14px 0', lineHeight: 1.2 }}>Онлайн-школа иностранных языков</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', lineHeight: 1.7, margin: '0 0 36px 0' }}>Учитесь у лучших преподавателей в интерактивном формате</p>
          {['🌍 18+ языков обучения', '👨‍🏫 Живые онлайн-уроки', '📝 Домашние задания', '📊 Прогресс и статистика'].map((t, i) => (
            <div key={i} style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', marginBottom: '10px' }}>{t}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: '40px' }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          <h2 style={{ margin: '0 0 6px 0', color: C.text, fontSize: '22px', fontWeight: '700' }}>{authMode === 'login' ? 'Добро пожаловать!' : 'Создать аккаунт'}</h2>
          <p style={{ color: C.sub, margin: '0 0 22px 0', fontSize: '13px' }}>{authMode === 'login' ? 'Войдите в личный кабинет' : 'Зарегистрируйтесь бесплатно'}</p>
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
            {authMode === 'register' && <>
              <input type="text" placeholder="Ваше имя" required value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} style={S.inp} />
              <select value={authForm.role} onChange={e => setAuthForm({ ...authForm, role: e.target.value })} style={S.inp}>
                <option value="student">Ученик 🧑‍🎓</option>
                <option value="teacher">Преподаватель 👨‍🏫</option>
                <option value="admin">Администратор 🛠️</option>
              </select>
            </>}
            <input type="email" placeholder="Email" required value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} style={S.inp} />
            <input type="password" placeholder="Пароль" required value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} style={S.inp} />
            <button type="submit" style={{ ...S.btn(), padding: '12px', fontSize: '15px' }}>{authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '16px', color: C.sub, fontSize: '13px' }}>
            {authMode === 'login' ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
            <span onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={{ color: C.blue, cursor: 'pointer', fontWeight: '600' }}>{authMode === 'login' ? 'Создать' : 'Войти'}</span>
          </p>
        </div>
      </div>
    </div>
  );

  // ── ДОСКА / КОМНАТА ───────────────────────────────────────────────────────
  if (roomId) {
    const isTeacher = currentUser?.role === 'teacher';
    const roomTitle = roomId.startsWith('hw_') ? '📝 Домашнее задание' : roomId.startsWith('sched_') ? '📅 Запланированный урок' : '📋 Онлайн-урок';

    return (
      <div style={{ minHeight: '100vh', background: C.bg, fontFamily: FONT }}>
        {/* Шапка */}
        <div style={{ background: '#fff', borderBottom: `1px solid ${C.border}`, padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => { setRoomId(''); setChatMessages([]); window.history.pushState(null, null, '/'); }}
              style={{ ...S.btn('#6b7280'), padding: '7px 14px', fontSize: '12px' }}>← Выйти</button>
            <div><div style={{ fontWeight: '700', color: C.text, fontSize: '15px' }}>{roomTitle}</div><div style={{ color: C.sub, fontSize: '11px' }}>ID: {roomId}</div></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {localStream ? (
              <>
                <button onClick={toggleMic} style={{ ...S.btn(isMicMuted ? C.danger : '#6b7280'), padding: '7px 12px', fontSize: '12px' }}>
                  {isMicMuted ? '🔇 Включить' : '🎤 Выкл.'}
                </button>
                <button onClick={toggleCamera} style={{ ...S.btn(isCameraOff ? C.danger : '#6b7280'), padding: '7px 12px', fontSize: '12px' }}>
                  {isCameraOff ? '📵 Включить' : '📷 Выкл.'}
                </button>
              </>
            ) : (
              <button onClick={turnOnCamera} style={{ ...S.btn(), padding: '7px 14px', fontSize: '12px' }}>🎥 Камера</button>
            )}
            {isTeacher && (
              <div style={{ display: 'flex', gap: '4px' }}>
                {[['📄 Текст', '#10b981', 'text'], ['🎬 Видео', C.blue, 'video'], ['❓ Тест', '#f59e0b', 'quiz'], ['✏️ Доска', C.teal, 'canvas']].map(([l, c, t]) => (
                  <button key={t} onClick={() => addBlock(t)} style={{ ...S.btn(c), padding: '6px 10px', fontSize: '11px' }}>{l}</button>
                ))}
                <button onClick={clearBoard} style={{ ...S.btn(C.danger), padding: '6px 10px', fontSize: '11px' }}>✕</button>
              </div>
            )}
          </div>
        </div>

        {/* Основной контент */}
        <div style={{ display: 'flex', height: 'calc(100vh - 53px)' }}>
          {/* Левая панель: видео */}
          <div style={{ width: '220px', flexShrink: 0, background: '#111827', display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', overflowY: 'auto' }}>
            <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#1f2937' }}>
              <video ref={myVideo} autoPlay muted playsInline style={{ width: '100%', display: localStream ? 'block' : 'none', aspectRatio: '4/3', objectFit: 'cover' }} />
              {!localStream && <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>Нет камеры</div>}
              <div style={{ position: 'absolute', bottom: '4px', left: '6px', color: '#fff', fontSize: '10px', background: 'rgba(0,0,0,0.5)', padding: '2px 5px', borderRadius: '4px' }}>{currentUser?.name ?? 'Вы'} {isMicMuted ? '🔇' : ''}</div>
            </div>
            {Object.entries(remoteStreams).map(([sid, stream]) => (
              <div key={sid} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#1f2937' }}>
                <video autoPlay playsInline style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover' }} ref={v => { if (v) v.srcObject = stream; }} />
                <div style={{ position: 'absolute', bottom: '4px', left: '6px', color: '#fff', fontSize: '10px', background: 'rgba(0,0,0,0.5)', padding: '2px 5px', borderRadius: '4px' }}>Участник</div>
              </div>
            ))}
          </div>

          {/* Центр: блоки */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {!blocks.length && (
              <div style={{ textAlign: 'center', color: C.sub, paddingTop: '80px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                <p style={{ fontSize: '14px' }}>Доска пуста{isTeacher ? ' — добавьте блок сверху' : ''}</p>
              </div>
            )}
            {blocks.map(b => (
              <div key={b.id} style={{ marginBottom: '12px', padding: '14px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px' }}>
                {b.type === 'text' && (
                  <textarea value={b.content} onChange={e => updBlock(b.id, e.target.value)} readOnly={!isTeacher}
                    style={{ ...S.inp, minHeight: '100px', resize: 'vertical' }} placeholder="Текст урока..." />
                )}
                {b.type === 'video' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {isTeacher && <input type="text" value={b.content} onChange={e => updBlock(b.id, e.target.value)} placeholder="Ссылка YouTube..." style={S.inp} />}
                    {b.content && <iframe width="100%" height="340" src={b.content.includes('watch?v=') ? b.content.replace('watch?v=', 'embed/') : b.content} frameBorder="0" allowFullScreen style={{ borderRadius: '8px' }} />}
                  </div>
                )}
                {b.type === 'canvas' && (
                  <InteractiveBoard
                    socket={socket}
                    readOnly={!isTeacher}
                    initialDataUrl={typeof b.content === 'string' && b.content.startsWith('data:') ? b.content : null}
                    onSave={dataUrl => updBlock(b.id, dataUrl)}
                  />
                )}
                {b.type === 'quiz' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    {isTeacher ? (
                      <>
                        <input type="text" placeholder="Вопрос..." value={b.content.question}
                          onChange={e => updQuiz(b.id, 'question', e.target.value)} style={{ ...S.inp, fontWeight: '600' }} />
                        {b.content.options.map((opt, i) => (
                          <div key={i} style={{ display: 'flex', gap: '9px', alignItems: 'center' }}>
                            <input type="radio" name={`q-${b.id}`} checked={b.content.correctAnswer === i} onChange={() => updQuiz(b.id, 'correctAnswer', i)} />
                            <input type="text" placeholder={`Вариант ${i + 1}`} value={opt}
                              onChange={e => { const a = [...b.content.options]; a[i] = e.target.value; updQuiz(b.id, 'options', a); }} style={S.inp} />
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <h3 style={{ margin: '0 0 10px 0', color: C.text, fontSize: '15px' }}>{b.content.question || 'Вопрос...'}</h3>
                        {b.content.options.map((opt, i) => {
                          if (!opt) return null;
                          const sel = b.content.studentAnswer === i;
                          const cor = sel && i === b.content.correctAnswer;
                          return <button key={i} onClick={() => updQuiz(b.id, 'studentAnswer', i)} disabled={b.content.studentAnswer !== null}
                            style={{ width: '100%', padding: '10px', textAlign: 'left', borderRadius: '8px', cursor: 'pointer', fontFamily: FONT, fontSize: '13px', marginBottom: '5px', border: `1px solid ${sel ? (cor ? '#10b981' : C.danger) : C.border}`, background: sel ? (cor ? '#d1fae5' : '#fee2e2') : '#fff', color: sel ? (cor ? '#065f46' : '#991b1b') : C.text }}>{opt}</button>;
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Правая панель: чат */}
          <div style={{ width: '260px', flexShrink: 0, background: '#fff', borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px', fontWeight: '600', color: C.text, fontSize: '13px', borderBottom: `1px solid ${C.border}` }}>💬 Чат</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {chatMessages.map((msg, i) => (
                <div key={i}>
                  {msg.type === 'system' ? (
                    <div style={{ fontSize: '11px', color: C.sub, fontStyle: 'italic', textAlign: 'center', padding: '2px 0' }}>{msg.text}</div>
                  ) : (
                    <div style={{ background: msg.sender === currentUser?.name ? '#e8f3fd' : C.bg, borderRadius: '8px', padding: '7px 10px' }}>
                      <div style={{ fontSize: '10px', color: C.blue, fontWeight: '600', marginBottom: '2px' }}>{msg.sender === currentUser?.name ? 'Вы' : msg.sender}</div>
                      <div style={{ fontSize: '13px', color: C.text }}>{msg.text}</div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChat} style={{ padding: '10px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '6px' }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Сообщение..." style={{ ...S.inp, fontSize: '13px', padding: '8px 10px' }} />
              <button type="submit" style={{ ...S.btn(), padding: '8px 12px', fontSize: '13px', flexShrink: 0 }}>→</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── ДАШБОРД ───────────────────────────────────────────────────────────────
  const menu = MENUS[currentUser.role] || MENUS.student;

  // ── Расписание: вспомогательные функции ──────────────────────────────────
  const getWeekDays = (offset = 0) => {
    const now = new Date();
    now.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(now.getDate() + i);
      return d;
    });
  };
  const weekDays = getWeekDays(weekOffset);
  const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const todayStr = new Date().toISOString().split('T')[0];
  const timeToY = (time) => { const [h, m] = time.split(':').map(Number); return (h - 8) * 60 + m; };
  const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);

  const renderContent = () => {
    const sec = section;

    // ════════════════════ TEACHER ════════════════════
    if (currentUser.role === 'teacher') {

      // ── Классы ──────────────────────────────────────
      if (sec === 'classes') {
        const filtered = lessons.filter(l => l.room_id.toLowerCase().includes(search.toLowerCase()));
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, color: C.text, fontSize: '20px', fontWeight: '700' }}>Классы</h2>
              <button onClick={createLesson} style={S.btn()}>+ Создать класс</button>
            </div>
            <div style={S.card}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <SearchBar placeholder="Поиск классов" value={search} onChange={setSearch} />
                <button style={S.filterBtn}>🔽 Фильтр</button>
              </div>
              <Tabs tabs={['Все', 'Индивидуальные', 'Групповые']} active={activeTab} onChange={setActiveTab} />
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: C.sub }}>
                  <div style={{ fontSize: '48px', marginBottom: '14px' }}>👩‍🏫</div>
                  <p style={{ fontSize: '14px' }}>Создайте класс для проведения обучения</p>
                  <button onClick={createLesson} style={{ ...S.btn(), marginTop: '16px' }}>+ Создать класс</button>
                </div>
              ) : (
                <>
                  <div style={{ color: C.sub, fontSize: '12px', marginBottom: '12px' }}>Кол-во классов: {filtered.length}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.map((l, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', borderRadius: '10px', background: C.bg, border: `1px solid ${C.border}` }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: C.blue + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>📋</div>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ fontWeight: '600', color: C.text, fontSize: '14px' }}>Класс: {l.room_id}</div>
                          <div style={{ fontSize: '11px', color: C.sub }}>Индивидуальный класс</div>
                        </div>
                        <button onClick={() => joinLesson(l.room_id)} style={{ ...S.btn(), padding: '7px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>→ Войти в класс</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      }

      // ── Ученики ─────────────────────────────────────
      if (sec === 'students') {
        if (selectedStudent) {
          const done = studentHw.filter(h => h.status === 'completed').length;
          return (
            <div>
              <button onClick={() => setSelectedStudent(null)} style={{ ...S.btnOut, marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>← Все ученики</button>
              <div style={{ ...S.card, display: 'flex', gap: '18px', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: C.blue + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.blue, fontSize: '26px', fontWeight: '800', flexShrink: 0 }}>{selectedStudent.name[0].toUpperCase()}</div>
                <div style={{ flexGrow: 1 }}>
                  <h2 style={{ margin: '0 0 4px 0', color: C.text, fontSize: '20px' }}>{selectedStudent.name}</h2>
                  <div style={{ display: 'flex', gap: '16px', color: C.sub, fontSize: '12px', marginBottom: '10px' }}><span>🆔 {selectedStudent.id}</span><span>✉️ {selectedStudent.email}</span></div>
                  <div style={{ display: 'flex', gap: '8px' }}><Badge label="✓ Активирован" color={C.success} bg="#d1fae5" /><Badge label="Ученик" color={C.blue} bg="#dbeafe" /></div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => joinLesson(`room_${currentUser.id}_${selectedStudent.id}`)} style={{ ...S.btn(), display: 'flex', alignItems: 'center', gap: '6px' }}>→ Войти в класс</button>
                  <button onClick={() => { setHwForm({ email: selectedStudent.email, title: '' }); setSection('materials'); setMaterialsTab('Личные материалы'); setSelectedStudent(null); }} style={S.btnOut}>+ ДЗ</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '14px' }}>
                <StatCard icon="📝" value={studentHw.length} label="Всего заданий" color={C.blue} />
                <StatCard icon="✅" value={done} label="Выполнено" color={C.success} />
                <StatCard icon="⏳" value={studentHw.length - done} label="В процессе" color={C.warning} />
              </div>
              <div style={S.card}>
                <div style={{ fontWeight: '600', color: C.text, marginBottom: '12px', fontSize: '14px' }}>Домашние задания</div>
                {!studentHw.length ? <p style={{ color: C.sub, fontSize: '13px' }}>Заданий нет</p> : studentHw.map((h, i) => (
                  <div key={i} onClick={() => joinLesson(h.hw_id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', borderRadius: '8px', border: `1px solid ${C.border}`, marginBottom: '7px', cursor: 'pointer', background: C.bg }}>
                    <span style={{ fontWeight: '500', color: C.text, fontSize: '13px' }}>📖 {h.title}</span>
                    <Badge label={h.status === 'completed' ? 'Выполнено' : 'В процессе'} color={h.status === 'completed' ? C.success : C.warning} bg={h.status === 'completed' ? '#d1fae5' : '#fef3c7'} />
                  </div>
                ))}
              </div>
            </div>
          );
        }

        const filteredStudents = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()));
        return (
          <div>
            <h2 style={{ margin: '0 0 16px 0', color: C.text, fontSize: '20px', fontWeight: '700' }}>Ученики</h2>
            <div style={S.card}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <SearchBar placeholder="Поиск учеников" value={search} onChange={setSearch} />
                <button style={S.filterBtn}>🔽 Фильтр</button>
              </div>
              <Tabs tabs={['Все', 'Онлайн-уроки']} active={activeTab} onChange={setActiveTab} />
              {filteredStudents.length > 0 && <div style={{ color: C.sub, fontSize: '12px', marginBottom: '12px' }}>Кол-во учеников: {filteredStudents.length}</div>}
              {!filteredStudents.length ? (
                <div style={{ textAlign: 'center', padding: '50px', color: C.sub }}><div style={{ fontSize: '40px', marginBottom: '10px' }}>👤</div><p style={{ fontSize: '14px' }}>Нет зарегистрированных учеников</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {filteredStudents.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', borderRadius: '10px', background: '#fff', border: `1px solid ${C.border}` }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: C.blue + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.blue, fontSize: '16px', fontWeight: '700', flexShrink: 0 }}>{s.name[0].toUpperCase()}</div>
                      <div style={{ flexGrow: 1 }}>
                        <div style={{ fontWeight: '600', color: C.text, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {s.name} <span style={{ color: C.blue, fontSize: '13px' }}>✓</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '3px' }}>
                          <span style={{ fontSize: '11px', color: C.sub }}>🆔 {s.id}</span>
                          <span style={{ fontSize: '11px', color: C.sub }}>{s.email}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => joinLesson(`room_${currentUser.id}_${s.id}`)} style={{ ...S.btn(), padding: '7px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>→ Войти в класс</button>
                        <button onClick={() => setSelectedStudent(s)} style={{ width: '32px', height: '32px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>👤</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }

      // ── Материалы ───────────────────────────────────
      if (sec === 'materials') {
        return (
          <div>
            <h2 style={{ margin: '0 0 16px 0', color: C.text, fontSize: '20px', fontWeight: '700' }}>Материалы</h2>
            <div style={S.card}>
              <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: '16px' }}>
                {['Каталог', 'Личные материалы', 'Личные доски'].map(t => (
                  <div key={t} onClick={() => setMaterialsTab(t)} style={{ padding: '10px 16px', cursor: 'pointer', fontWeight: materialsTab === t ? '600' : '400', color: materialsTab === t ? C.blue : C.sub, borderBottom: materialsTab === t ? `2px solid ${C.blue}` : '2px solid transparent', fontSize: '13px', marginBottom: '-1px', transition: 'all 0.12s' }}>{t}</div>
                ))}
              </div>

              {materialsTab === 'Каталог' && (
                <>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                    <SearchBar placeholder="Поиск материалов и уроков" value={search} onChange={setSearch} />
                    <button style={S.filterBtn}>🔽 Фильтр</button>
                  </div>
                  <div style={{ color: C.sub, fontSize: '12px', marginBottom: '14px' }}>Кол-во курсов: {CATALOG.length}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: '14px' }}>
                    {CATALOG.filter(m => m.title.toLowerCase().includes(search.toLowerCase())).map((m, i) => (
                      <div key={i} style={{ borderRadius: '10px', overflow: 'hidden', border: `1px solid ${C.border}`, cursor: 'pointer' }}>
                        <div style={{ height: '110px', background: m.color, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>
                          {m.emoji}
                          <div style={{ color: '#fff', fontWeight: '700', fontSize: '13px', marginTop: '6px' }}>{m.title}</div>
                        </div>
                        <div style={{ padding: '10px' }}>
                          <div style={{ fontSize: '12px', color: C.sub }}>DoubleLang</div>
                          <div style={{ fontSize: '11px', color: C.blue, marginTop: '3px', fontWeight: '600' }}>ДОСТУПНО</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {materialsTab === 'Личные материалы' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                      <div style={{ fontWeight: '600', color: C.text, marginBottom: '12px', fontSize: '14px' }}>Назначить ДЗ</div>
                      <form onSubmit={assignHw} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <input type="email" placeholder="Email ученика" required value={hwForm.email} onChange={e => setHwForm({ ...hwForm, email: e.target.value })} style={S.inp} />
                        <input type="text" placeholder="Название задания" required value={hwForm.title} onChange={e => setHwForm({ ...hwForm, title: e.target.value })} style={S.inp} />
                        <button type="submit" style={S.btn(C.teal)}>Отправить</button>
                      </form>
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', color: C.text, marginBottom: '12px', fontSize: '14px' }}>Отправленные ДЗ ({hw.length})</div>
                      <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        {!hw.length && <p style={{ color: C.sub, fontSize: '13px' }}>Заданий пока нет</p>}
                        {hw.map((h, i) => (
                          <div key={i} onClick={() => joinLesson(h.hw_id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: C.bg, borderRadius: '8px', cursor: 'pointer', border: `1px solid ${C.border}` }}>
                            <div><div style={{ fontWeight: '500', fontSize: '13px', color: C.text }}>{h.title}</div><div style={{ fontSize: '11px', color: C.sub }}>{h.student_email}</div></div>
                            <Badge label={h.status === 'completed' ? 'Готово' : 'В работе'} color={h.status === 'completed' ? C.success : C.warning} bg={h.status === 'completed' ? '#d1fae5' : '#fef3c7'} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {materialsTab === 'Личные доски' && (
                <>
                  <button onClick={createLesson} style={{ ...S.btn(), marginBottom: '14px' }}>+ Создать доску</button>
                  {!lessons.length ? <p style={{ color: C.sub, fontSize: '13px' }}>Досок пока нет</p> : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '12px' }}>
                      {lessons.map((l, i) => (
                        <div key={i} onClick={() => joinLesson(l.room_id)} style={{ border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden', cursor: 'pointer' }}>
                          <div style={{ height: '80px', background: `hsl(${(i * 47) % 360},50%,85%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>📋</div>
                          <div style={{ padding: '10px' }}><div style={{ fontWeight: '600', fontSize: '13px', color: C.text }}>{l.room_id}</div><div style={{ fontSize: '11px', color: C.sub, marginTop: '2px' }}>Интерактивная доска</div></div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      }

      // ── Расписание ──────────────────────────────────
      if (sec === 'schedule') {
        const weekLabel = `${weekDays[0].getDate()} ${MONTHS_RU[weekDays[0].getMonth()]} – ${weekDays[6].getDate()} ${MONTHS_RU[weekDays[6].getMonth()]}`;
        const now = new Date();
        const currentMinute = (now.getHours() - 8) * 60 + now.getMinutes();
        const ROW_H = 48;

        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, color: C.text, fontSize: '20px', fontWeight: '700' }}>Расписание</h2>
              <button onClick={() => setShowScheduleForm(!showScheduleForm)} style={S.btn()}>+ Добавить урок</button>
            </div>

            {showScheduleForm && (
              <div style={{ ...S.card, marginBottom: '16px' }}>
                <div style={{ fontWeight: '600', color: C.text, marginBottom: '12px', fontSize: '14px' }}>Запланировать урок</div>
                <form onSubmit={addSchedule} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <input type="text" placeholder="Название урока" required value={scheduleForm.title} onChange={e => setScheduleForm({ ...scheduleForm, title: e.target.value })} style={S.inp} />
                  <input type="email" placeholder="Email ученика (необязательно)" value={scheduleForm.student_email} onChange={e => setScheduleForm({ ...scheduleForm, student_email: e.target.value })} style={S.inp} />
                  <input type="date" required value={scheduleForm.lesson_date} onChange={e => setScheduleForm({ ...scheduleForm, lesson_date: e.target.value })} style={S.inp} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="time" value={scheduleForm.start_time} onChange={e => setScheduleForm({ ...scheduleForm, start_time: e.target.value })} style={{ ...S.inp, flex: 1 }} />
                    <input type="time" value={scheduleForm.end_time} onChange={e => setScheduleForm({ ...scheduleForm, end_time: e.target.value })} style={{ ...S.inp, flex: 1 }} />
                  </div>
                  <button type="submit" style={{ ...S.btn(), gridColumn: '1/-1' }}>Сохранить</button>
                </form>
              </div>
            )}

            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={() => setWeekOffset(w => w - 1)} style={{ width: '30px', height: '30px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>←</button>
                  <span style={{ fontWeight: '600', color: C.text, fontSize: '14px' }}>{weekLabel}</span>
                  <button onClick={() => setWeekOffset(w => w + 1)} style={{ width: '30px', height: '30px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>→</button>
                </div>
                <div style={{ fontSize: '12px', color: C.sub, background: C.bg, padding: '5px 10px', borderRadius: '6px' }}>
                  {now.getHours()}:{String(now.getMinutes()).padStart(2, '0')} (UTC+3)
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: '700px' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(7,1fr)', borderBottom: `1px solid ${C.border}`, marginBottom: '4px' }}>
                    <div></div>
                    {weekDays.map((d, i) => {
                      const isToday = d.toISOString().split('T')[0] === todayStr;
                      return (
                        <div key={i} style={{ textAlign: 'center', padding: '6px 0', fontSize: '12px' }}>
                          <span style={{ color: C.sub }}>{DAYS_RU[i]}, </span>
                          <span style={{ display: 'inline-block', width: '24px', height: '24px', lineHeight: '24px', borderRadius: '50%', background: isToday ? '#ef4444' : 'transparent', color: isToday ? '#fff' : C.text, fontWeight: isToday ? '700' : '500', fontSize: '13px' }}>{d.getDate()}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Time grid */}
                  <div style={{ position: 'relative' }}>
                    {HOURS.map(h => (
                      <div key={h} style={{ display: 'grid', gridTemplateColumns: '50px repeat(7,1fr)', height: `${ROW_H}px`, borderBottom: `1px solid #f3f4f6` }}>
                        <div style={{ fontSize: '11px', color: C.sub, paddingTop: '4px', paddingRight: '8px', textAlign: 'right', lineHeight: 1 }}>{h}:00</div>
                        {weekDays.map((d, di) => (
                          <div key={di} style={{ borderLeft: `1px solid #f3f4f6`, background: h % 2 === 0 ? '#fafbff' : '#fff' }}></div>
                        ))}
                      </div>
                    ))}

                    {/* Current time line */}
                    {weekOffset === 0 && currentMinute >= 0 && currentMinute <= 14 * 60 && (
                      <div style={{ position: 'absolute', top: `${currentMinute / 60 * ROW_H}px`, left: '50px', right: 0, height: '2px', background: '#ef4444', zIndex: 10, display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', marginLeft: '-4px' }}></div>
                      </div>
                    )}

                    {/* Schedule blocks */}
                    {scheduleData.map((ev, i) => {
                      const evDate = new Date(ev.lesson_date);
                      const dayIndex = weekDays.findIndex(d => d.toISOString().split('T')[0] === evDate.toISOString().split('T')[0]);
                      if (dayIndex === -1) return null;
                      const startMin = timeToY(ev.start_time);
                      const endMin = timeToY(ev.end_time);
                      if (startMin < 0 || startMin > 14 * 60) return null;
                      const colWidth = 100 / 7;
                      return (
                        <div key={i} style={{ position: 'absolute', top: `${startMin / 60 * ROW_H}px`, left: `calc(50px + ${dayIndex * colWidth}% + 2px)`, width: `calc(${colWidth}% - 4px)`, height: `${(endMin - startMin) / 60 * ROW_H}px`, background: C.blue + '33', border: `1px solid ${C.blue}`, borderRadius: '6px', padding: '3px 6px', overflow: 'hidden', zIndex: 5, cursor: 'pointer' }}
                          onClick={() => { if (window.confirm(`Удалить "${ev.title}"?`)) deleteSchedule(ev.id); }}>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: C.navy, lineHeight: 1.2 }}>{ev.title}</div>
                          <div style={{ fontSize: '10px', color: C.sub }}>{ev.start_time}–{ev.end_time}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // ── Настройки ────────────────────────────────────
      if (sec === 'settings') {
        if (settingsView === 'profile') return (
          <div>
            <button onClick={() => setSettingsView(null)} style={{ ...S.btnOut, marginBottom: '18px' }}>← Настройки</button>
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', alignItems: 'start' }}>
              {/* Карточка аватара */}
              <div style={{ ...S.card, textAlign: 'center' }}>
                <div style={{ width: '96px', height: '96px', borderRadius: '50%', background: `linear-gradient(135deg, ${C.blue}, #252641)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '36px', fontWeight: '800', margin: '0 auto 14px' }}>
                  {profileForm.name ? profileForm.name[0].toUpperCase() : currentUser.name[0].toUpperCase()}
                </div>
                <div style={{ fontWeight: '700', color: C.text, fontSize: '16px', marginBottom: '4px' }}>{profileForm.name || currentUser.name}</div>
                <div style={{ color: C.sub, fontSize: '12px', marginBottom: '12px' }}>{currentUser.email}</div>
                <Badge label={currentUser.role === 'teacher' ? '👨‍🏫 Преподаватель' : currentUser.role === 'admin' ? '🛠️ Администратор' : '🧑‍🎓 Ученик'} color={C.blue} bg='#dbeafe' />
                {profileForm.about && (
                  <p style={{ color: C.sub, fontSize: '12px', marginTop: '14px', lineHeight: 1.6, textAlign: 'left' }}>{profileForm.about}</p>
                )}
                {profileForm.language && (
                  <div style={{ marginTop: '10px', fontSize: '12px', color: C.sub, textAlign: 'left' }}>🌍 Преподаёт: <strong style={{ color: C.text }}>{profileForm.language}</strong></div>
                )}
                {profileForm.phone && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: C.sub, textAlign: 'left' }}>📱 <strong style={{ color: C.text }}>{profileForm.phone}</strong></div>
                )}
                <div style={{ marginTop: '6px', fontSize: '12px', color: C.sub, textAlign: 'left' }}>🕐 Часовой пояс: <strong style={{ color: C.text }}>{profileForm.timezone}</strong></div>
              </div>

              {/* Форма редактирования */}
              <div style={S.card}>
                <h3 style={{ margin: '0 0 20px 0', color: C.text, fontSize: '17px', fontWeight: '700' }}>Редактировать профиль</h3>
                <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: C.sub, display: 'block', marginBottom: '5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Имя *</label>
                      <input type="text" required value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} style={S.inp} placeholder="Ваше имя" />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: C.sub, display: 'block', marginBottom: '5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Телефон</label>
                      <input type="tel" value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} style={S.inp} placeholder="+7 (999) 000-00-00" />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: C.sub, display: 'block', marginBottom: '5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</label>
                    <input type="email" value={currentUser.email} disabled style={{ ...S.inp, background: C.bg, color: C.sub }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: C.sub, display: 'block', marginBottom: '5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Язык преподавания</label>
                      <select value={profileForm.language} onChange={e => setProfileForm({ ...profileForm, language: e.target.value })} style={S.inp}>
                        <option value="">Не указан</option>
                        {['Английский', 'Немецкий', 'Французский', 'Испанский', 'Итальянский', 'Китайский', 'Японский', 'Корейский', 'Португальский', 'Арабский', 'Турецкий', 'Голландский'].map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: C.sub, display: 'block', marginBottom: '5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Часовой пояс</label>
                      <select value={profileForm.timezone} onChange={e => setProfileForm({ ...profileForm, timezone: e.target.value })} style={S.inp}>
                        {['UTC-5', 'UTC-3', 'UTC+0', 'UTC+1', 'UTC+2', 'UTC+3', 'UTC+4', 'UTC+5', 'UTC+6', 'UTC+7', 'UTC+8'].map(tz => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: C.sub, display: 'block', marginBottom: '5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>О себе</label>
                    <textarea value={profileForm.about} onChange={e => setProfileForm({ ...profileForm, about: e.target.value })} style={{ ...S.inp, minHeight: '100px', resize: 'vertical' }} placeholder="Расскажите об опыте, методике преподавания..." />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                    <button type="submit" style={{ ...S.btn(), flex: 1 }}>Сохранить изменения</button>
                    <button type="button" onClick={() => setProfileForm({ name: currentUser.name, phone: '', about: '', language: '', timezone: 'UTC+3' })} style={{ ...S.btnOut, padding: '9px 16px' }}>Сбросить</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        );

        if (settingsView === 'notifications') return (
          <div>
            <button onClick={() => setSettingsView(null)} style={{ ...S.btnOut, marginBottom: '16px' }}>← Настройки</button>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 20px 0', color: C.text, fontSize: '16px' }}>Уведомления</h3>
              <p style={{ color: C.sub, fontSize: '14px' }}>Настройка почтовых рассылок и уведомлений платформы будет доступна в следующем обновлении.</p>
            </div>
          </div>
        );

        return (
          <div>
            <h2 style={{ margin: '0 0 16px 0', color: C.text, fontSize: '20px', fontWeight: '700' }}>Настройки</h2>
            <div style={S.card}>
              <div style={{ position: 'relative', marginBottom: '20px' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: C.sub }}>🔍</span>
                <input placeholder="Поиск" style={{ ...S.inp, paddingLeft: '34px' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div onClick={() => setSettingsView('profile')} style={{ padding: '24px', borderRadius: '10px', border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'box-shadow 0.15s' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '12px' }}>👤</div>
                  <div style={{ fontWeight: '600', color: C.text, marginBottom: '6px', fontSize: '15px' }}>Личный профиль</div>
                  <div style={{ color: C.sub, fontSize: '13px' }}>Ваша персональная информация</div>
                </div>
                <div onClick={() => setSettingsView('notifications')} style={{ padding: '24px', borderRadius: '10px', border: `1px solid ${C.border}`, cursor: 'pointer' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '12px' }}>🔔</div>
                  <div style={{ fontWeight: '600', color: C.text, marginBottom: '6px', fontSize: '15px' }}>Уведомления</div>
                  <div style={{ color: C.sub, fontSize: '13px' }}>Настроить почтовые рассылки и другие уведомления платформы</div>
                </div>
              </div>
            </div>
          </div>
        );
      }
    }

    // ════════════════════ STUDENT ════════════════════
    if (currentUser.role === 'student') {
      if (sec === 'dashboard') {
        const done = hw.filter(h => h.status === 'completed').length;
        return (
          <div>
            <h2 style={{ margin: '0 0 18px 0', color: C.text, fontSize: '20px', fontWeight: '700' }}>Мой кабинет</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '16px' }}>
              <StatCard icon="📝" value={hw.length} label="Всего заданий" color={C.blue} />
              <StatCard icon="✅" value={done} label="Выполнено" color={C.success} />
              <StatCard icon="⏳" value={hw.length - done} label="Осталось" color={C.warning} />
            </div>
            <div style={S.card}>
              <div style={{ fontWeight: '600', color: C.text, marginBottom: '12px', fontSize: '14px' }}>Актуальные задания</div>
              {hw.filter(h => h.status !== 'completed').slice(0, 5).map((h, i) => (
                <div key={i} onClick={() => joinLesson(h.hw_id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', background: C.bg, borderRadius: '8px', marginBottom: '7px', cursor: 'pointer', border: `1px solid ${C.border}` }}>
                  <span style={{ fontWeight: '500', color: C.text, fontSize: '13px' }}>📖 {h.title}</span>
                  <span style={{ color: C.blue, fontSize: '12px' }}>Выполнить →</span>
                </div>
              ))}
              {!hw.filter(h => h.status !== 'completed').length && <p style={{ color: C.success, fontSize: '13px' }}>✓ Все задания выполнены!</p>}
            </div>
          </div>
        );
      }
      if (sec === 'lessons') return (
        <div>
          <h2 style={{ margin: '0 0 16px 0', color: C.text, fontSize: '20px', fontWeight: '700' }}>Мои уроки</h2>
          <div style={S.card}>
            <div style={{ fontWeight: '600', color: C.text, marginBottom: '8px', fontSize: '14px' }}>Подключиться к уроку</div>
            <p style={{ color: C.sub, fontSize: '13px', margin: '0 0 12px 0' }}>Введите код от преподавателя:</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="text" placeholder="Код (например: x9f2a)" id="join-room" style={S.inp} />
              <button onClick={() => joinLesson(document.getElementById('join-room').value)} style={{ ...S.btn(), whiteSpace: 'nowrap' }}>Войти →</button>
            </div>
          </div>
        </div>
      );
      if (sec === 'homework') return (
        <div>
          <h2 style={{ margin: '0 0 16px 0', color: C.text, fontSize: '20px', fontWeight: '700' }}>Домашние задания</h2>
          {!hw.length ? <div style={{ ...S.card, textAlign: 'center', padding: '40px', color: C.sub }}><div style={{ fontSize: '36px', marginBottom: '10px' }}>📚</div><p>Пока нет заданий</p></div> : hw.map((h, i) => (
            <div key={i} onClick={() => joinLesson(h.hw_id)} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '9px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: C.blue + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📖</div>
                <div><div style={{ fontWeight: '600', color: C.text, fontSize: '14px' }}>{h.title}</div><div style={{ fontSize: '11px', color: C.sub }}>Нажмите чтобы выполнить</div></div>
              </div>
              <Badge label={h.status === 'completed' ? 'Сдано ✓' : 'Выполнить →'} color={h.status === 'completed' ? C.success : C.blue} bg={h.status === 'completed' ? '#d1fae5' : '#dbeafe'} />
            </div>
          ))}
        </div>
      );
    }

    // ════════════════════ ADMIN ════════════════════
    if (sec === 'stats') return (
      <div>
        <h2 style={{ margin: '0 0 18px 0', color: C.text, fontSize: '20px', fontWeight: '700' }}>Показатели платформы</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '18px' }}>
          <StatCard icon="👥" value={users.length} label="Пользователей" color={C.navy} />
          <StatCard icon="🧑‍🎓" value={students.length} label="Учеников" color={C.blue} />
          <StatCard icon="👨‍🏫" value={teachers.length} label="Преподавателей" color={C.teal} />
          <StatCard icon="📋" value={lessons.length} label="Уроков" color={'#6495ed'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {[{ title: 'Последние ученики', data: students, color: C.blue }, { title: 'Преподаватели', data: teachers, color: C.teal }].map((g, gi) => (
            <div key={gi} style={S.card}>
              <div style={{ fontWeight: '600', color: C.text, marginBottom: '12px', fontSize: '14px' }}>{g.title}</div>
              {!g.data.length && <p style={{ color: C.sub, fontSize: '13px' }}>Нет данных</p>}
              {g.data.slice(0, 5).map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < 4 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: g.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: '700' }}>{u.name[0]?.toUpperCase()}</div>
                  <div><div style={{ fontWeight: '500', fontSize: '13px', color: C.text }}>{u.name}</div><div style={{ fontSize: '11px', color: C.sub }}>{u.email}</div></div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );

    const tableData = sec === 'students' ? students : sec === 'teachers' ? teachers : sec === 'lessons' ? lessons : [];
    const tableTitle = sec === 'students' ? `Ученики (${students.length})` : sec === 'teachers' ? `Сотрудники (${teachers.length})` : `Все уроки (${lessons.length})`;
    if (['students', 'teachers', 'lessons'].includes(sec)) return (
      <div>
        <h2 style={{ margin: '0 0 16px 0', color: C.text, fontSize: '20px', fontWeight: '700' }}>{tableTitle}</h2>
        <div style={S.card}>
          {sec !== 'lessons' && <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}><SearchBar placeholder={`Поиск...`} value={search} onChange={setSearch} /><button style={S.filterBtn}>🔽 Фильтр</button></div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: C.bg }}>{(sec === 'lessons' ? ['ID урока', ''] : ['ID', 'Пользователь', 'Email', 'Роль/Статус']).map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: C.sub, fontWeight: '600', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {sec === 'lessons' ? tableData.map((l, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '11px 14px', fontWeight: '500', color: C.text, fontSize: '13px' }}>📋 {l.room_id}</td>
                  <td style={{ padding: '11px 14px' }}><button onClick={() => joinLesson(l.room_id)} style={{ ...S.btn(), padding: '6px 12px', fontSize: '11px' }}>Войти →</button></td>
                </tr>
              )) : tableData.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())).map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '11px 14px', color: C.sub, fontSize: '12px' }}>{u.id}</td>
                  <td style={{ padding: '11px 14px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}><div style={{ width: '28px', height: '28px', borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: '700' }}>{u.name[0]?.toUpperCase()}</div><span style={{ fontWeight: '500', color: C.text, fontSize: '13px' }}>{u.name}</span></div></td>
                  <td style={{ padding: '11px 14px', color: C.sub, fontSize: '12px' }}>{u.email}</td>
                  <td style={{ padding: '11px 14px' }}><Badge label={u.role === 'teacher' ? '👨‍🏫 Учитель' : u.role === 'admin' ? '🛠️ Админ' : '🧑‍🎓 Ученик'} color={u.role === 'teacher' ? C.teal : u.role === 'admin' ? C.navy : C.warning} bg={u.role === 'teacher' ? '#ccfbf1' : u.role === 'admin' ? '#e8f3fd' : '#fef3c7'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

    if (sec === 'settings') return (
      <div>
        <h2 style={{ margin: '0 0 16px 0', color: C.text, fontSize: '20px', fontWeight: '700' }}>Настройки</h2>
        <div style={{ ...S.card, textAlign: 'center', padding: '50px', color: C.sub }}><div style={{ fontSize: '40px', marginBottom: '10px' }}>⚙️</div><p>Раздел настроек администратора в разработке</p></div>
      </div>
    );

    return null;
  };

  // ── LAYOUT ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: FONT, display: 'flex', minHeight: '100vh', background: C.bg }}>
      {/* Sidebar */}
      <div style={{ width: '210px', background: '#fff', position: 'fixed', top: 0, left: 0, bottom: 0, display: 'flex', flexDirection: 'column', zIndex: 100, borderRight: `1px solid ${C.border}` }}>
        <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.navy, fontSize: '16px', fontWeight: '800' }}>DoubleLang</div>
          <div style={{ color: C.blue, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: '2px', fontWeight: '600' }}>Платформа</div>
        </div>
        <nav style={{ padding: '8px 0', flexGrow: 1 }}>
          {menu.map((item, idx) => {
            const isActive = section === item.key;
            const dividers = { teacher: [3], admin: [2, 4], student: [] };
            return (
              <div key={item.key}>
                {(dividers[currentUser.role] || []).includes(idx) && <div style={{ margin: '6px 14px', borderTop: `1px solid ${C.border}` }} />}
                <div onClick={() => { setSection(item.key); setSelectedStudent(null); setSearch(''); }}
                  style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', color: isActive ? C.activeTxt : '#adb5bd', background: isActive ? C.activeItem : 'transparent', borderRadius: '0 8px 8px 0', marginRight: '8px', fontSize: '13px', fontWeight: isActive ? '700' : '500', transition: 'all 0.12s' }}>
                  <span style={{ fontSize: '14px' }}>{item.icon}</span>{item.label}
                </div>
              </div>
            );
          })}
        </nav>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '9px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: C.blue + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.blue, fontWeight: '700', fontSize: '11px', flexShrink: 0 }}>{currentUser.name[0].toUpperCase()}</div>
            <div style={{ overflow: 'hidden' }}><div style={{ color: C.text, fontSize: '12px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div><div style={{ color: C.sub, fontSize: '10px' }}>{currentUser.role === 'teacher' ? 'Преподаватель' : currentUser.role === 'admin' ? 'Администратор' : 'Ученик'}</div></div>
          </div>
          <button onClick={logout} style={{ width: '100%', padding: '7px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontFamily: FONT }}>Выйти</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ marginLeft: '210px', flexGrow: 1 }}>
        <header style={{ background: '#fff', borderBottom: `1px solid ${C.border}`, padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 }}>
          <div><h1 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: C.text }}>{menu.find(m => m.key === section)?.label || 'Главная'}</h1><p style={{ margin: 0, fontSize: '11px', color: C.sub }}>DoubleLang — платформа онлайн-обучения</p></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: C.bg, borderRadius: '20px', padding: '5px 12px', fontSize: '11px', color: C.sub }}>{currentUser.email}</div>
          </div>
        </header>
        <main style={{ padding: '22px 24px' }}>{renderContent()}</main>
      </div>
    </div>
  );
}
