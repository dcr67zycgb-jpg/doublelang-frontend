import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'https://doublelang-backend.onrender.com';
const pcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const C = {
  navy: '#252641', blue: '#74abe9', cornflower: '#6495ed', teal: '#21747a',
  bg: '#f2f6ff', card: '#ffffff', text: '#252641', sub: '#6b7280',
  border: '#e5e7eb', success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
};

function Badge({ label, color, bg }) {
  return <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', color, background: bg }}>{label}</span>;
}

function Stat({ icon, value, label, color }) {
  return (
    <div style={{ background: C.card, borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '28px', fontWeight: '700', color: C.text }}>{value}</div>
        <div style={{ fontSize: '13px', color: C.sub }}>{label}</div>
      </div>
    </div>
  );
}

function DrawingBoard({ block, updateContent }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  useEffect(() => {
    if (!block.content) return;
    const img = new Image();
    img.onload = () => { const ctx = canvasRef.current.getContext('2d'); ctx.clearRect(0,0,750,250); ctx.drawImage(img,0,0); };
    img.src = block.content;
  }, [block.content]);
  const start = (e) => { setIsDrawing(true); const ctx = canvasRef.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY); };
  const draw = (e) => { if (!isDrawing) return; const ctx = canvasRef.current.getContext('2d'); ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY); ctx.stroke(); };
  const stop = () => { if (!isDrawing) return; setIsDrawing(false); updateContent(block.id, canvasRef.current.toDataURL()); };
  return <canvas ref={canvasRef} width={750} height={250} onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseOut={stop} style={{ width: '100%', cursor: 'crosshair', touchAction: 'none', background: '#fff' }} />;
}

const MENUS = {
  teacher: [
    { key: 'dashboard', icon: '⊞', label: 'Главная' },
    { key: 'students',  icon: '🧑‍🎓', label: 'Ученики' },
    { key: 'lessons',   icon: '📋', label: 'Онлайн-уроки' },
    { key: 'homework',  icon: '📝', label: 'Домашние задания' },
    { key: 'schedule',  icon: '📅', label: 'Расписание' },
  ],
  student: [
    { key: 'dashboard', icon: '⊞', label: 'Главная' },
    { key: 'lessons',   icon: '📋', label: 'Мои уроки' },
    { key: 'homework',  icon: '📝', label: 'Домашние задания' },
  ],
  admin: [
    { key: 'users', icon: '👥', label: 'Пользователи' },
  ],
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => { const s = localStorage.getItem('doublelang_user'); return s ? JSON.parse(s) : null; });
  const [role, setRole] = useState(() => { const s = localStorage.getItem('doublelang_user'); return s ? JSON.parse(s).role : null; });
  const [roomId, setRoomId] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const myVideoRef = useRef(); const remoteVideoRef = useRef(); const pcRef = useRef(null); const localStreamRef = useRef(null);

  const [section, setSection] = useState('dashboard');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [lessonsList, setLessonsList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [hwList, setHwList] = useState([]);
  const [studentHw, setStudentHw] = useState([]);
  const [hwForm, setHwForm] = useState({ studentEmail: '', title: '' });
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'student' });

  const card = { background: C.card, borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${C.border}` };
  const inp = { padding: '10px 14px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '15px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: C.text };
  const btn = (bg = C.blue) => ({ padding: '10px 20px', background: bg, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: 'inherit' });
  const btnOut = { padding: '10px 20px', background: 'transparent', color: C.blue, border: `1px solid ${C.blue}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: 'inherit' };

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('lesson');
    if (room) { setRoomId(room); return; }
    if (!currentUser) return;
    if (currentUser.role === 'teacher') {
      fetch(`${API_URL}/api/lessons?teacher_id=${currentUser.id}`).then(r=>r.json()).then(setLessonsList).catch(()=>{});
      fetch(`${API_URL}/api/homework/teacher?teacher_id=${currentUser.id}`).then(r=>r.json()).then(setHwList).catch(()=>{});
      fetch(`${API_URL}/api/users`).then(r=>r.json()).then(setUsersList).catch(()=>{});
    }
    if (currentUser.role === 'student') fetch(`${API_URL}/api/homework/student?email=${currentUser.email}`).then(r=>r.json()).then(setHwList).catch(()=>{});
    if (currentUser.role === 'admin') fetch(`${API_URL}/api/users`).then(r=>r.json()).then(setUsersList).catch(()=>{});
  }, [currentUser]);

  useEffect(() => {
    if (!selectedStudent) return;
    fetch(`${API_URL}/api/homework/student?email=${selectedStudent.email}`).then(r=>r.json()).then(setStudentHw).catch(()=>{});
  }, [selectedStudent]);

  useEffect(() => {
    if (!role || !roomId) return;
    const sk = io(API_URL, { query: { roomId, userName: currentUser?.name || 'Пользователь', userId: currentUser?.id || null } });
    setSocket(sk);
    sk.on('update_board', b => setBlocks(b || []));
    sk.on('webrtc_offer', async offer => {
      const pc = new RTCPeerConnection(pcConfig); pcRef.current = pc;
      pc.onicecandidate = e => e.candidate && sk.emit('webrtc_ice_candidate', e.candidate);
      pc.ontrack = e => remoteVideoRef.current && (remoteVideoRef.current.srcObject = e.streams[0]);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
      await pc.setRemoteDescription(offer);
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); sk.emit('webrtc_answer', ans);
    });
    sk.on('webrtc_answer', async a => pcRef.current && await pcRef.current.setRemoteDescription(a));
    sk.on('webrtc_ice_candidate', async c => pcRef.current && await pcRef.current.addIceCandidate(new RTCIceCandidate(c)));
    return () => sk.disconnect();
  }, [role, roomId]);

  const handleAuth = async e => {
    e.preventDefault();
    const res = await fetch(`${API_URL}${authMode === 'login' ? '/api/login' : '/api/register'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authForm) });
    const data = await res.json();
    if (data.token) { setCurrentUser(data.user); setRole(data.user.role); localStorage.setItem('doublelang_user', JSON.stringify(data.user)); localStorage.setItem('doublelang_token', data.token); }
    else if (data.id) { alert('Успешно! Войдите.'); setAuthMode('login'); }
    else alert(data.error);
  };

  const logout = () => { setCurrentUser(null); setRole(null); localStorage.clear(); window.location.href = '/'; };

  const assignHw = async e => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/api/homework/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacher_id: currentUser.id, student_email: hwForm.studentEmail, title: hwForm.title, board_content: [{ id: Date.now(), type: 'text', content: '' }] }) });
    if (res.ok) { alert('ДЗ отправлено!'); setHwForm({ studentEmail: '', title: '' }); fetch(`${API_URL}/api/homework/teacher?teacher_id=${currentUser.id}`).then(r=>r.json()).then(setHwList); }
  };

  const joinLesson = id => { if (!id) return; window.history.pushState(null, null, '?lesson=' + id); setRoomId(id); };
  const createLesson = () => joinLesson(Math.random().toString(36).substring(7));

  const addBlock = type => { const nb = [...blocks, { id: Date.now(), type, content: type === 'quiz' ? { question: '', options: ['','','',''], correctAnswer: 0, studentAnswer: null } : '' }]; setBlocks(nb); socket.emit('board_change', nb); };
  const handleClear = () => { setBlocks([]); socket.emit('board_change', []); };
  const updateBlock = (id, text) => { const nb = blocks.map(b => b.id===id ? {...b, content: text} : b); setBlocks(nb); socket.emit('board_change', nb); };
  const updateQuiz = (id, f, v) => { const nb = blocks.map(b => b.id===id ? {...b, content: {...b.content, [f]: v}} : b); setBlocks(nb); socket.emit('board_change', nb); };

  const turnOnCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream); localStreamRef.current = stream;
      if (myVideoRef.current) myVideoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection(pcConfig); pcRef.current = pc;
      pc.onicecandidate = e => e.candidate && socket.emit('webrtc_ice_candidate', e.candidate);
      pc.ontrack = e => remoteVideoRef.current && (remoteVideoRef.current.srcObject = e.streams[0]);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('webrtc_offer', offer);
    } catch(err) { console.error(err); }
  };

  // ── AUTH ──────────────────────────────────────────────────────────────────
  if (!currentUser && !roomId) return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '42%', background: C.navy, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px', color: '#fff' }}>
        <div style={{ maxWidth: '320px', width: '100%' }}>
          <div style={{ fontSize: '13px', color: C.blue, fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>DoubleLang</div>
          <h1 style={{ fontSize: '38px', fontWeight: '800', margin: '0 0 16px 0', lineHeight: 1.2 }}>Онлайн-школа иностранных языков</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '16px', margin: '0 0 40px 0', lineHeight: 1.6 }}>Учитесь у лучших преподавателей в интерактивном формате</p>
          {['🌍 18+ языков обучения', '👨‍🏫 Живые онлайн-уроки', '📝 Домашние задания', '📊 Отслеживание прогресса'].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(255,255,255,0.75)', fontSize: '15px', marginBottom: '12px' }}>{t}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: '40px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <h2 style={{ margin: '0 0 6px 0', color: C.text, fontSize: '26px', fontWeight: '700' }}>{authMode === 'login' ? 'Добро пожаловать!' : 'Создать аккаунт'}</h2>
          <p style={{ color: C.sub, margin: '0 0 28px 0' }}>{authMode === 'login' ? 'Войдите в личный кабинет' : 'Зарегистрируйтесь бесплатно'}</p>
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {authMode === 'register' && <>
              <input type="text" placeholder="Ваше имя" required value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} style={inp} />
              <select value={authForm.role} onChange={e => setAuthForm({...authForm, role: e.target.value})} style={inp}>
                <option value="student">Ученик 🧑‍🎓</option>
                <option value="teacher">Преподаватель 👨‍🏫</option>
                <option value="admin">Администратор 🛠️</option>
              </select>
            </>}
            <input type="email" placeholder="Email" required value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} style={inp} />
            <input type="password" placeholder="Пароль" required value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} style={inp} />
            <button type="submit" style={{ ...btn(C.blue), padding: '14px', fontSize: '16px' }}>{authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '20px', color: C.sub }}>
            {authMode === 'login' ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
            <span onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={{ color: C.blue, cursor: 'pointer', fontWeight: '600' }}>{authMode === 'login' ? 'Создать' : 'Войти'}</span>
          </p>
        </div>
      </div>
    </div>
  );

  // ── LESSON BOARD ──────────────────────────────────────────────────────────
  if (roomId) return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui', padding: '20px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', gap: '20px' }}>
        <div style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={card}>
            <h4 style={{ margin: '0 0 12px 0', color: C.text }}>Видеосвязь</h4>
            {[myVideoRef, remoteVideoRef].map((ref, i) => (
              <div key={i} style={{ height: '148px', background: '#111827', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px', position: 'relative' }}>
                <video ref={ref} autoPlay muted={i===0} playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: i===0 && !localStream ? 'none' : 'block' }}></video>
                {i===0 && !localStream && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', textAlign: 'center', paddingTop: '62px' }}>Моя камера</div>}
                {i===1 && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', textAlign: 'center', paddingTop: '62px', position: 'absolute', top: 0, width: '100%', zIndex: 0 }}>Собеседник</div>}
              </div>
            ))}
            {!localStream && <button onClick={turnOnCamera} style={{ ...btn(), width: '100%', padding: '9px' }}>🎥 Включить камеру</button>}
          </div>
          <button onClick={() => { setRoomId(''); window.history.pushState(null, null, '/'); }} style={{ ...btn(C.sub), width: '100%' }}>← Выйти в кабинет</button>
        </div>

        <div style={{ flexGrow: 1 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <h2 style={{ margin: 0, color: C.text, fontSize: '18px' }}>{roomId.startsWith('hw_') ? '📝 Домашнее задание' : '📋 Онлайн-урок'}</h2>
                <span style={{ color: C.sub, fontSize: '12px' }}>ID: {roomId}</span>
              </div>
              {role === 'teacher' && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[['Текст','#10b981','text'],['Видео',C.blue,'video'],['Тест','#f59e0b','quiz'],['Рисование',C.teal,'canvas']].map(([l,c,t]) => (
                    <button key={t} onClick={() => addBlock(t)} style={{ ...btn(c), padding: '7px 12px', fontSize: '12px' }}>+ {l}</button>
                  ))}
                  <button onClick={handleClear} style={{ ...btn(C.danger), padding: '7px 12px', fontSize: '12px' }}>Очистить</button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {blocks.length === 0 && <p style={{ color: C.sub, fontStyle: 'italic', textAlign: 'center', padding: '40px 0' }}>Доска пуста...</p>}
              {blocks.map(block => (
                <div key={block.id} style={{ padding: '14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
                  {block.type === 'text' && <textarea value={block.content} onChange={e => updateBlock(block.id, e.target.value)} style={{ ...inp, minHeight: '90px', resize: 'vertical' }} placeholder="Текст урока..." />}
                  {block.type === 'video' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <input type="text" value={block.content} onChange={e => updateBlock(block.id, e.target.value)} placeholder="Ссылка YouTube..." style={inp} />
                      {block.content && <iframe width="100%" height="320" src={block.content.includes('watch?v=') ? block.content.replace('watch?v=','embed/') : block.content} frameBorder="0" allowFullScreen style={{ borderRadius: '8px' }}></iframe>}
                    </div>
                  )}
                  {block.type === 'canvas' && <DrawingBoard block={block} updateContent={updateBlock} />}
                  {block.type === 'quiz' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {role === 'teacher' ? <>
                        <input type="text" placeholder="Вопрос..." value={block.content.question} onChange={e => updateQuiz(block.id,'question',e.target.value)} style={{ ...inp, fontWeight: '600' }} />
                        {block.content.options.map((opt, i) => (
                          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input type="radio" name={`q-${block.id}`} checked={block.content.correctAnswer===i} onChange={() => updateQuiz(block.id,'correctAnswer',i)} />
                            <input type="text" placeholder={`Вариант ${i+1}`} value={opt} onChange={e => { const a=[...block.content.options]; a[i]=e.target.value; updateQuiz(block.id,'options',a); }} style={inp} />
                          </div>
                        ))}
                      </> : <>
                        <h3 style={{ margin: '0 0 10px 0', color: C.text }}>{block.content.question || 'Вопрос...'}</h3>
                        {block.content.options.map((opt, i) => {
                          if (!opt) return null;
                          const sel = block.content.studentAnswer===i, cor = sel && i===block.content.correctAnswer;
                          return <button key={i} onClick={() => updateQuiz(block.id,'studentAnswer',i)} disabled={block.content.studentAnswer!==null} style={{ width:'100%', padding:'11px', textAlign:'left', borderRadius:'8px', border:`1px solid ${sel?(cor?'#10b981':C.danger):C.border}`, cursor:'pointer', background: sel?(cor?'#d1fae5':'#fee2e2'):'#fff', color: sel?(cor?'#065f46':'#991b1b'):C.text, fontFamily:'inherit', fontSize:'14px', marginBottom:'4px' }}>{opt}</button>;
                        })}
                      </>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  const menu = MENUS[currentUser.role] || MENUS.student;
  const students = usersList.filter(u => u.role === 'student');

  const renderSection = () => {
    // ── TEACHER ──
    if (currentUser.role === 'teacher') {
      if (section === 'dashboard') return (
        <div>
          <h2 style={{ margin: '0 0 24px 0', color: C.text }}>Обзор</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '24px' }}>
            <Stat icon="🧑‍🎓" value={students.length} label="Учеников" color={C.blue} />
            <Stat icon="📋" value={lessonsList.length} label="Уроков создано" color={C.teal} />
            <Stat icon="📝" value={hwList.length} label="Отправлено ДЗ" color={C.cornflower} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={card}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: C.text }}>Последние уроки</h3>
              {lessonsList.slice(0,4).map((l,i) => (
                <div key={i} onClick={() => joinLesson(l.room_id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px', borderRadius:'8px', cursor:'pointer', marginBottom:'6px', background: C.bg }}>
                  <span style={{ color: C.text, fontSize:'14px', fontWeight:'500' }}>Урок: {l.room_id}</span>
                  <span style={{ color: C.blue, fontSize:'13px' }}>Открыть →</span>
                </div>
              ))}
              {!lessonsList.length && <p style={{ color: C.sub, fontSize:'14px' }}>Уроков пока нет</p>}
              <button onClick={createLesson} style={{ ...btn(), marginTop:'10px', width:'100%', padding:'9px' }}>+ Создать урок</button>
            </div>
            <div style={card}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: C.text }}>Последние ДЗ</h3>
              {hwList.slice(0,4).map((hw,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px', borderRadius:'8px', marginBottom:'6px', background: C.bg }}>
                  <div><div style={{ fontWeight:'500', fontSize:'14px', color:C.text }}>{hw.title}</div><div style={{ fontSize:'12px', color:C.sub }}>{hw.student_email}</div></div>
                  <Badge label={hw.status==='completed'?'✓ Готово':'⏳ В работе'} color={hw.status==='completed'?C.success:C.warning} bg={hw.status==='completed'?'#d1fae5':'#fef3c7'} />
                </div>
              ))}
              {!hwList.length && <p style={{ color: C.sub, fontSize:'14px' }}>ДЗ пока нет</p>}
            </div>
          </div>
        </div>
      );

      if (section === 'students') {
        if (selectedStudent) {
          const done = studentHw.filter(h=>h.status==='completed').length;
          return (
            <div>
              <button onClick={() => setSelectedStudent(null)} style={{ ...btnOut, marginBottom:'20px', display:'flex', alignItems:'center', gap:'6px' }}>← Все ученики</button>
              <div style={{ ...card, display:'flex', gap:'20px', alignItems:'flex-start', marginBottom:'16px' }}>
                <div style={{ width:'72px', height:'72px', borderRadius:'50%', background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'28px', fontWeight:'bold', flexShrink:0 }}>{selectedStudent.name[0].toUpperCase()}</div>
                <div style={{ flexGrow:1 }}>
                  <h2 style={{ margin:'0 0 4px 0', color:C.text }}>{selectedStudent.name}</h2>
                  <div style={{ display:'flex', gap:'16px', color:C.sub, fontSize:'14px', marginBottom:'12px' }}><span>🆔 {selectedStudent.id}</span><span>✉️ {selectedStudent.email}</span></div>
                  <div style={{ display:'flex', gap:'8px' }}>
                    <Badge label="✓ Активен" color={C.success} bg="#d1fae5" />
                    <Badge label="Ученик" color={C.blue} bg="#dbeafe" />
                  </div>
                </div>
                <button onClick={() => { setHwForm({studentEmail: selectedStudent.email, title:''}); setSection('homework'); setSelectedStudent(null); }} style={btn(C.teal)}>+ Назначить ДЗ</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'16px' }}>
                <Stat icon="📝" value={studentHw.length} label="Всего заданий" color={C.blue} />
                <Stat icon="✅" value={done} label="Выполнено" color={C.success} />
                <Stat icon="⏳" value={studentHw.length-done} label="В процессе" color={C.warning} />
              </div>
              <div style={card}>
                <h3 style={{ margin:'0 0 16px 0', color:C.text }}>Домашние задания</h3>
                {!studentHw.length ? <p style={{ color:C.sub }}>Заданий нет</p> : studentHw.map((hw,i) => (
                  <div key={i} onClick={() => joinLesson(hw.hw_id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderRadius:'8px', border:`1px solid ${C.border}`, marginBottom:'8px', cursor:'pointer', background:C.bg }}>
                    <span style={{ fontWeight:'500', color:C.text }}>📖 {hw.title}</span>
                    <Badge label={hw.status==='completed'?'Выполнено':'В процессе'} color={hw.status==='completed'?C.success:C.warning} bg={hw.status==='completed'?'#d1fae5':'#fef3c7'} />
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
              <h2 style={{ margin:0, color:C.text }}>Ученики</h2>
              <span style={{ color:C.sub, fontSize:'14px' }}>Всего: {students.length}</span>
            </div>
            {!students.length ? (
              <div style={{ ...card, textAlign:'center', padding:'40px', color:C.sub }}><div style={{ fontSize:'40px', marginBottom:'12px' }}>🧑‍🎓</div><p>Нет зарегистрированных учеников</p></div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(290px,1fr))', gap:'14px' }}>
                {students.map(s => (
                  <div key={s.id} onClick={() => setSelectedStudent(s)} style={{ ...card, cursor:'pointer', display:'flex', alignItems:'center', gap:'14px' }}>
                    <div style={{ width:'48px', height:'48px', borderRadius:'50%', background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'18px', fontWeight:'bold', flexShrink:0 }}>{s.name[0].toUpperCase()}</div>
                    <div style={{ flexGrow:1, overflow:'hidden' }}>
                      <div style={{ fontWeight:'600', color:C.text, marginBottom:'2px' }}>{s.name}</div>
                      <div style={{ fontSize:'13px', color:C.sub, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.email}</div>
                      <div style={{ fontSize:'11px', color:C.sub, marginTop:'2px' }}>ID: {s.id}</div>
                    </div>
                    <Badge label="Активен" color={C.success} bg="#d1fae5" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      if (section === 'lessons') return (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
            <h2 style={{ margin:0, color:C.text }}>Онлайн-уроки</h2>
            <button onClick={createLesson} style={btn()}>+ Новый урок</button>
          </div>
          {!lessonsList.length ? (
            <div style={{ ...card, textAlign:'center', padding:'40px', color:C.sub }}><div style={{ fontSize:'40px', marginBottom:'12px' }}>📋</div><p>Уроков пока нет</p><button onClick={createLesson} style={{ ...btn(), marginTop:'12px' }}>Создать первый урок</button></div>
          ) : lessonsList.map((l,i) => (
            <div key={i} style={{ ...card, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
                <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:C.teal+'22', display:'flex', alignItems:'center', justifyContent:'center' }}>📋</div>
                <div><div style={{ fontWeight:'600', color:C.text }}>Урок: {l.room_id}</div><div style={{ fontSize:'12px', color:C.sub }}>Интерактивная доска</div></div>
              </div>
              <button onClick={() => joinLesson(l.room_id)} style={{ ...btn(), padding:'8px 16px', fontSize:'13px' }}>Войти →</button>
            </div>
          ))}
        </div>
      );

      if (section === 'homework') return (
        <div>
          <h2 style={{ margin:'0 0 24px 0', color:C.text }}>Домашние задания</h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'24px' }}>
            <div style={card}>
              <h3 style={{ margin:'0 0 16px 0', fontSize:'15px', color:C.text }}>Назначить задание</h3>
              <form onSubmit={assignHw} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <div><label style={{ fontSize:'12px', color:C.sub, display:'block', marginBottom:'4px' }}>Email ученика</label><input type="email" placeholder="student@example.com" required value={hwForm.studentEmail} onChange={e=>setHwForm({...hwForm,studentEmail:e.target.value})} style={inp} /></div>
                <div><label style={{ fontSize:'12px', color:C.sub, display:'block', marginBottom:'4px' }}>Название задания</label><input type="text" placeholder="Например: Present Simple — упр. 3" required value={hwForm.title} onChange={e=>setHwForm({...hwForm,title:e.target.value})} style={inp} /></div>
                <button type="submit" style={{ ...btn(C.teal), marginTop:'4px' }}>Отправить задание</button>
              </form>
            </div>
            <div style={card}>
              <h3 style={{ margin:'0 0 16px 0', fontSize:'15px', color:C.text }}>Отправленные ДЗ ({hwList.length})</h3>
              <div style={{ maxHeight:'360px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'8px' }}>
                {!hwList.length && <p style={{ color:C.sub, fontSize:'14px' }}>Заданий пока нет</p>}
                {hwList.map((hw,i) => (
                  <div key={i} onClick={() => joinLesson(hw.hw_id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px', background:C.bg, borderRadius:'8px', cursor:'pointer', border:`1px solid ${C.border}` }}>
                    <div><div style={{ fontWeight:'500', fontSize:'14px', color:C.text }}>{hw.title}</div><div style={{ fontSize:'11px', color:C.sub }}>{hw.student_email}</div></div>
                    <Badge label={hw.status==='completed'?'Готово':'В работе'} color={hw.status==='completed'?C.success:C.warning} bg={hw.status==='completed'?'#d1fae5':'#fef3c7'} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );

      if (section === 'schedule') return (
        <div style={{ ...card, textAlign:'center', padding:'60px', color:C.sub }}>
          <div style={{ fontSize:'48px', marginBottom:'12px' }}>📅</div>
          <h2 style={{ color:C.text }}>Расписание</h2>
          <p>Раздел будет доступен в следующем обновлении</p>
        </div>
      );
    }

    // ── STUDENT ──
    if (currentUser.role === 'student') {
      if (section === 'dashboard') {
        const done = hwList.filter(h=>h.status==='completed').length;
        return (
          <div>
            <h2 style={{ margin:'0 0 24px 0', color:C.text }}>Мой кабинет</h2>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'24px' }}>
              <Stat icon="📝" value={hwList.length} label="Всего заданий" color={C.blue} />
              <Stat icon="✅" value={done} label="Выполнено" color={C.success} />
              <Stat icon="⏳" value={hwList.length-done} label="Осталось" color={C.warning} />
            </div>
            <div style={card}>
              <h3 style={{ margin:'0 0 12px 0', fontSize:'15px', color:C.text }}>Актуальные задания</h3>
              {hwList.filter(h=>h.status!=='completed').slice(0,5).map((hw,i) => (
                <div key={i} onClick={() => joinLesson(hw.hw_id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:C.bg, borderRadius:'8px', marginBottom:'8px', cursor:'pointer', border:`1px solid ${C.border}` }}>
                  <span style={{ fontWeight:'500', color:C.text }}>📖 {hw.title}</span>
                  <span style={{ color:C.blue, fontSize:'13px' }}>Выполнить →</span>
                </div>
              ))}
              {hwList.filter(h=>h.status!=='completed').length===0 && <p style={{ color:C.success }}>✓ Все задания выполнены!</p>}
            </div>
          </div>
        );
      }
      if (section === 'lessons') return (
        <div>
          <h2 style={{ margin:'0 0 24px 0', color:C.text }}>Мои уроки</h2>
          <div style={card}>
            <h3 style={{ margin:'0 0 8px 0', fontSize:'15px', color:C.text }}>Подключиться к уроку</h3>
            <p style={{ color:C.sub, fontSize:'14px', margin:'0 0 14px 0' }}>Введите код от преподавателя:</p>
            <div style={{ display:'flex', gap:'10px' }}>
              <input type="text" placeholder="Код урока (например: x9f2a)" id="join-room" style={inp} />
              <button onClick={() => joinLesson(document.getElementById('join-room').value)} style={{ ...btn(), whiteSpace:'nowrap' }}>Войти →</button>
            </div>
          </div>
        </div>
      );
      if (section === 'homework') return (
        <div>
          <h2 style={{ margin:'0 0 24px 0', color:C.text }}>Домашние задания</h2>
          {!hwList.length ? (
            <div style={{ ...card, textAlign:'center', padding:'40px', color:C.sub }}><div style={{ fontSize:'40px', marginBottom:'12px' }}>📚</div><p>Пока нет заданий</p></div>
          ) : hwList.map((hw,i) => (
            <div key={i} onClick={() => joinLesson(hw.hw_id)} style={{ ...card, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px', cursor:'pointer' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
                <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:C.blue+'22', display:'flex', alignItems:'center', justifyContent:'center' }}>📖</div>
                <div><div style={{ fontWeight:'600', color:C.text }}>{hw.title}</div><div style={{ fontSize:'12px', color:C.sub }}>Нажмите чтобы выполнить</div></div>
              </div>
              <Badge label={hw.status==='completed'?'Сдано ✓':'Выполнить →'} color={hw.status==='completed'?C.success:C.blue} bg={hw.status==='completed'?'#d1fae5':'#dbeafe'} />
            </div>
          ))}
        </div>
      );
    }

    // ── ADMIN ──
    return (
      <div>
        <h2 style={{ margin:'0 0 24px 0', color:C.text }}>Пользователи платформы</h2>
        <div style={card}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:C.bg }}>{['ID','Имя','Email','Роль'].map(h=><th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'13px', color:C.sub, fontWeight:'600', borderBottom:`1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>{usersList.map(u=>(
              <tr key={u.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={{ padding:'13px 16px', color:C.sub, fontSize:'14px' }}>{u.id}</td>
                <td style={{ padding:'13px 16px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'11px', fontWeight:'bold' }}>{u.name[0]?.toUpperCase()}</div>
                    <span style={{ fontWeight:'500', color:C.text }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ padding:'13px 16px', color:C.sub, fontSize:'14px' }}>{u.email}</td>
                <td style={{ padding:'13px 16px' }}>
                  <Badge label={u.role==='teacher'?'👨‍🏫 Учитель':u.role==='admin'?'🛠️ Админ':'🧑‍🎓 Ученик'} color={u.role==='teacher'?C.blue:u.role==='admin'?C.teal:C.warning} bg={u.role==='teacher'?'#dbeafe':u.role==='admin'?'#ccfbf1':'#fef3c7'} />
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily:'system-ui, -apple-system, sans-serif', display:'flex', minHeight:'100vh', background:C.bg }}>
      {/* Sidebar */}
      <div style={{ width:'230px', background:C.navy, position:'fixed', top:0, left:0, bottom:0, display:'flex', flexDirection:'column', zIndex:100 }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ color:'#fff', fontSize:'18px', fontWeight:'800', letterSpacing:'-0.3px' }}>DoubleLang</div>
          <div style={{ color:C.blue, fontSize:'10px', textTransform:'uppercase', letterSpacing:'1.5px', marginTop:'3px' }}>Платформа обучения</div>
        </div>
        <nav style={{ padding:'10px 0', flexGrow:1 }}>
          {menu.map(item => (
            <div key={item.key} onClick={() => { setSection(item.key); setSelectedStudent(null); }}
              style={{ padding:'10px 22px', cursor:'pointer', display:'flex', alignItems:'center', gap:'11px', color:section===item.key?'#fff':'rgba(255,255,255,0.5)', background:section===item.key?'rgba(116,171,233,0.13)':'transparent', borderLeft:section===item.key?`3px solid ${C.blue}`:'3px solid transparent', fontSize:'14px', fontWeight:section===item.key?'600':'400', transition:'all 0.12s' }}>
              <span style={{ fontSize:'15px' }}>{item.icon}</span>{item.label}
            </div>
          ))}
        </nav>
        <div style={{ padding:'14px 22px', borderTop:'1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'10px' }}>
            <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:'bold', fontSize:'12px', flexShrink:0 }}>{currentUser.name[0].toUpperCase()}</div>
            <div style={{ overflow:'hidden' }}>
              <div style={{ color:'#fff', fontSize:'13px', fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{currentUser.name}</div>
              <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'11px' }}>{currentUser.role==='teacher'?'Преподаватель':currentUser.role==='admin'?'Администратор':'Ученик'}</div>
            </div>
          </div>
          <button onClick={logout} style={{ width:'100%', padding:'7px', background:'rgba(239,68,68,0.1)', color:'#f87171', border:'1px solid rgba(239,68,68,0.18)', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontFamily:'inherit' }}>Выйти</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ marginLeft:'230px', flexGrow:1 }}>
        <header style={{ background:'#fff', borderBottom:`1px solid ${C.border}`, padding:'14px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:50 }}>
          <div>
            <h1 style={{ margin:0, fontSize:'18px', fontWeight:'700', color:C.text }}>{menu.find(m=>m.key===section)?.label || 'Главная'}</h1>
            <p style={{ margin:0, fontSize:'12px', color:C.sub }}>DoubleLang — онлайн-платформа</p>
          </div>
          <div style={{ background:C.bg, borderRadius:'20px', padding:'6px 14px', fontSize:'13px', color:C.sub }}>{currentUser.email}</div>
        </header>
        <main style={{ padding:'28px 32px' }}>{renderSection()}</main>
      </div>
    </div>
  );
}
