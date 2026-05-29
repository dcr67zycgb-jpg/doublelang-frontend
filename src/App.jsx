import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'https://doublelang-backend.onrender.com';
const pcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const FONT = "'Montserrat', Arial, sans-serif";

const C = {
  blue: '#74abe9', navy: '#252641', teal: '#21747a', cornflower: '#6495ed',
  bg: '#f2f6ff', card: '#ffffff', text: '#252641', sub: '#9ca3af',
  border: '#e5e7eb', success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
  sidebarActive: '#e8f3fd', sidebarActiveTxt: '#74abe9',
};

// ── Утилиты ──────────────────────────────────────────────────────────────────
const Badge = ({ label, color, bg }) => (
  <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', color, background: bg, whiteSpace: 'nowrap' }}>{label}</span>
);

const StatCard = ({ icon, value, label, color }) => (
  <div style={{ background: C.card, borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '14px' }}>
    <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{icon}</div>
    <div><div style={{ fontSize: '26px', fontWeight: '700', color: C.text, lineHeight: 1 }}>{value}</div><div style={{ fontSize: '12px', color: C.sub, marginTop: '3px' }}>{label}</div></div>
  </div>
);

function DrawingBoard({ block, updateContent }) {
  const ref = useRef(null); const [drawing, setDrawing] = useState(false);
  useEffect(() => {
    if (!block.content) return;
    const img = new Image(); img.onload = () => { const c = ref.current.getContext('2d'); c.clearRect(0,0,750,250); c.drawImage(img,0,0); }; img.src = block.content;
  }, [block.content]);
  const start = e => { setDrawing(true); const c=ref.current.getContext('2d'); c.beginPath(); c.moveTo(e.nativeEvent.offsetX,e.nativeEvent.offsetY); };
  const draw = e => { if(!drawing) return; const c=ref.current.getContext('2d'); c.lineTo(e.nativeEvent.offsetX,e.nativeEvent.offsetY); c.stroke(); };
  const stop = () => { if(!drawing) return; setDrawing(false); updateContent(block.id,ref.current.toDataURL()); };
  return <canvas ref={ref} width={750} height={250} onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseOut={stop} style={{ width:'100%', cursor:'crosshair', touchAction:'none', background:'#fff', borderRadius:'6px' }} />;
}

// ── Меню ──────────────────────────────────────────────────────────────────────
const MENUS = {
  teacher: [
    { key:'dashboard', icon:'⊞', label:'Показатели' },
    { key:'students',  icon:'🧑‍🎓', label:'Ученики' },
    { key:'lessons',   icon:'📋', label:'Онлайн-уроки' },
    { key:'homework',  icon:'📝', label:'Домашние задания' },
    { key:'schedule',  icon:'📅', label:'Расписание' },
    { key:'settings',  icon:'⚙️', label:'Настройки' },
  ],
  student: [
    { key:'dashboard', icon:'⊞', label:'Главная' },
    { key:'lessons',   icon:'📋', label:'Мои уроки' },
    { key:'homework',  icon:'📝', label:'Домашние задания' },
  ],
  admin: [
    { key:'stats',     icon:'⊞', label:'Показатели' },
    { key:'students',  icon:'🧑‍🎓', label:'Ученики' },
    { key:'teachers',  icon:'👨‍🏫', label:'Сотрудники' },
    { key:'lessons',   icon:'📋', label:'Все уроки' },
    { key:'homework',  icon:'📝', label:'Домашние задания' },
    { key:'settings',  icon:'⚙️', label:'Настройки' },
  ],
};

// ── Главный компонент ─────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => { const s=localStorage.getItem('doublelang_user'); return s?JSON.parse(s):null; });
  const [role, setRole] = useState(() => { const s=localStorage.getItem('doublelang_user'); return s?JSON.parse(s).role:null; });
  const [roomId, setRoomId] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const myVideo=useRef(); const remoteVideo=useRef(); const pc=useRef(null); const streamRef=useRef(null);

  const [section, setSection] = useState('dashboard');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [users, setUsers] = useState([]);
  const [hw, setHw] = useState([]);
  const [studentHw, setStudentHw] = useState([]);
  const [hwForm, setHwForm] = useState({ email:'', title:'' });
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name:'', email:'', password:'', role:'student' });

  // стили
  const S = {
    inp: { padding:'11px 14px', borderRadius:'8px', border:`1px solid ${C.border}`, fontSize:'14px', outline:'none', width:'100%', fontFamily:FONT, color:C.text, background:'#fff' },
    btn: (bg=C.blue) => ({ padding:'10px 20px', background:bg, color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'600', fontSize:'14px', fontFamily:FONT }),
    btnOut: { padding:'9px 18px', background:'transparent', color:C.blue, border:`1px solid ${C.blue}`, borderRadius:'8px', cursor:'pointer', fontWeight:'600', fontSize:'13px', fontFamily:FONT },
    card: { background:C.card, borderRadius:'12px', padding:'20px', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', border:`1px solid ${C.border}` },
  };

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('lesson');
    if (room) { setRoomId(room); return; }
    if (!currentUser) return;
    if (currentUser.role==='teacher'||currentUser.role==='admin') {
      fetch(`${API_URL}/api/users`).then(r=>r.json()).then(setUsers).catch(()=>{});
    }
    if (currentUser.role==='teacher') {
      fetch(`${API_URL}/api/lessons?teacher_id=${currentUser.id}`).then(r=>r.json()).then(setLessons).catch(()=>{});
      fetch(`${API_URL}/api/homework/teacher?teacher_id=${currentUser.id}`).then(r=>r.json()).then(setHw).catch(()=>{});
    }
    if (currentUser.role==='admin') {
      fetch(`${API_URL}/api/lessons`).then(r=>r.json()).then(setLessons).catch(()=>{});
      fetch(`${API_URL}/api/homework/teacher?teacher_id=0`).then(()=>{}).catch(()=>{});
      // Грузим все ДЗ через отдельный запрос ниже
    }
    if (currentUser.role==='student') {
      fetch(`${API_URL}/api/homework/student?email=${currentUser.email}`).then(r=>r.json()).then(setHw).catch(()=>{});
    }
  }, [currentUser]);

  useEffect(() => {
    if (!selectedStudent) return;
    fetch(`${API_URL}/api/homework/student?email=${selectedStudent.email}`).then(r=>r.json()).then(setStudentHw).catch(()=>{});
  }, [selectedStudent]);

  useEffect(() => {
    if (!role||!roomId) return;
    const sk = io(API_URL, { query:{ roomId, userName:currentUser?.name||'User', userId:currentUser?.id||null } });
    setSocket(sk);
    sk.on('update_board', b=>setBlocks(b||[]));
    sk.on('webrtc_offer', async offer => {
      const p=new RTCPeerConnection(pcConfig); pc.current=p;
      p.onicecandidate=e=>e.candidate&&sk.emit('webrtc_ice_candidate',e.candidate);
      p.ontrack=e=>remoteVideo.current&&(remoteVideo.current.srcObject=e.streams[0]);
      if(streamRef.current) streamRef.current.getTracks().forEach(t=>p.addTrack(t,streamRef.current));
      await p.setRemoteDescription(offer); const ans=await p.createAnswer(); await p.setLocalDescription(ans); sk.emit('webrtc_answer',ans);
    });
    sk.on('webrtc_answer', async a=>pc.current&&await pc.current.setRemoteDescription(a));
    sk.on('webrtc_ice_candidate', async c=>pc.current&&await pc.current.addIceCandidate(new RTCIceCandidate(c)));
    return ()=>sk.disconnect();
  }, [role,roomId]);

  const handleAuth = async e => {
    e.preventDefault();
    const res=await fetch(`${API_URL}${authMode==='login'?'/api/login':'/api/register'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(authForm)});
    const d=await res.json();
    if(d.token){setCurrentUser(d.user);setRole(d.user.role);localStorage.setItem('doublelang_user',JSON.stringify(d.user));localStorage.setItem('doublelang_token',d.token);}
    else if(d.id){alert('Успешно! Войдите.');setAuthMode('login');}
    else alert(d.error);
  };
  const logout=()=>{setCurrentUser(null);setRole(null);localStorage.clear();window.location.href='/';};
  const joinLesson=id=>{if(!id)return;window.history.pushState(null,null,'?lesson='+id);setRoomId(id);};
  const createLesson=()=>joinLesson(Math.random().toString(36).substring(7));
  const addBlock=type=>{const nb=[...blocks,{id:Date.now(),type,content:type==='quiz'?{question:'',options:['','','',''],correctAnswer:0,studentAnswer:null}:''}];setBlocks(nb);socket.emit('board_change',nb);};
  const clearBoard=()=>{setBlocks([]);socket.emit('board_change',[]);};
  const updBlock=(id,v)=>{const nb=blocks.map(b=>b.id===id?{...b,content:v}:b);setBlocks(nb);socket.emit('board_change',nb);};
  const updQuiz=(id,f,v)=>{const nb=blocks.map(b=>b.id===id?{...b,content:{...b.content,[f]:v}}:b);setBlocks(nb);socket.emit('board_change',nb);};
  const assignHw=async e=>{e.preventDefault();const res=await fetch(`${API_URL}/api/homework/assign`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teacher_id:currentUser.id,student_email:hwForm.email,title:hwForm.title,board_content:[{id:Date.now(),type:'text',content:''}]})});if(res.ok){alert('ДЗ отправлено!');setHwForm({email:'',title:''});fetch(`${API_URL}/api/homework/teacher?teacher_id=${currentUser.id}`).then(r=>r.json()).then(setHw);}};
  const turnOnCamera=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});setLocalStream(stream);streamRef.current=stream;if(myVideo.current)myVideo.current.srcObject=stream;const p=new RTCPeerConnection(pcConfig);pc.current=p;p.onicecandidate=e=>e.candidate&&socket.emit('webrtc_ice_candidate',e.candidate);p.ontrack=e=>remoteVideo.current&&(remoteVideo.current.srcObject=e.streams[0]);stream.getTracks().forEach(t=>p.addTrack(t,stream));const offer=await p.createOffer();await p.setLocalDescription(offer);socket.emit('webrtc_offer',offer);}catch(err){console.error(err);}};

  const students = users.filter(u=>u.role==='student');
  const teachers = users.filter(u=>u.role==='teacher');

  // ── ЭКРАН ВХОДА ──────────────────────────────────────────────────────────
  if (!currentUser&&!roomId) return (
    <div style={{ minHeight:'100vh', display:'flex', fontFamily:FONT }}>
      <div style={{ width:'44%', background:C.navy, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:'60px' }}>
        <div style={{ maxWidth:'320px', width:'100%' }}>
          <div style={{ color:C.blue, fontSize:'12px', fontWeight:'700', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'14px' }}>DoubleLang</div>
          <h1 style={{ fontSize:'36px', fontWeight:'800', color:'#fff', margin:'0 0 14px 0', lineHeight:1.2 }}>Онлайн-школа иностранных языков</h1>
          <p style={{ color:'rgba(255,255,255,0.55)', fontSize:'15px', lineHeight:1.7, margin:'0 0 36px 0' }}>Учитесь у лучших преподавателей в интерактивном формате</p>
          {['🌍 18+ языков обучения','👨‍🏫 Живые онлайн-уроки','📝 Домашние задания','📊 Отслеживание прогресса'].map((t,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', color:'rgba(255,255,255,0.7)', fontSize:'14px', marginBottom:'10px' }}>{t}</div>
          ))}
        </div>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:C.bg, padding:'40px' }}>
        <div style={{ width:'100%', maxWidth:'380px' }}>
          <h2 style={{ margin:'0 0 6px 0', color:C.text, fontSize:'24px', fontWeight:'700' }}>{authMode==='login'?'Добро пожаловать!':'Создать аккаунт'}</h2>
          <p style={{ color:C.sub, margin:'0 0 24px 0', fontSize:'14px' }}>{authMode==='login'?'Войдите в личный кабинет':'Зарегистрируйтесь бесплатно'}</p>
          <form onSubmit={handleAuth} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {authMode==='register'&&<>
              <input type="text" placeholder="Ваше имя" required value={authForm.name} onChange={e=>setAuthForm({...authForm,name:e.target.value})} style={S.inp} />
              <select value={authForm.role} onChange={e=>setAuthForm({...authForm,role:e.target.value})} style={S.inp}>
                <option value="student">Ученик 🧑‍🎓</option>
                <option value="teacher">Преподаватель 👨‍🏫</option>
                <option value="admin">Администратор 🛠️</option>
              </select>
            </>}
            <input type="email" placeholder="Email" required value={authForm.email} onChange={e=>setAuthForm({...authForm,email:e.target.value})} style={S.inp} />
            <input type="password" placeholder="Пароль" required value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} style={S.inp} />
            <button type="submit" style={{ ...S.btn(), padding:'13px', fontSize:'15px' }}>{authMode==='login'?'Войти':'Зарегистрироваться'}</button>
          </form>
          <p style={{ textAlign:'center', marginTop:'18px', color:C.sub, fontSize:'14px' }}>
            {authMode==='login'?'Нет аккаунта? ':'Уже есть аккаунт? '}
            <span onClick={()=>setAuthMode(authMode==='login'?'register':'login')} style={{ color:C.blue, cursor:'pointer', fontWeight:'600' }}>{authMode==='login'?'Создать':'Войти'}</span>
          </p>
        </div>
      </div>
    </div>
  );

  // ── ДОСКА УРОКА ──────────────────────────────────────────────────────────
  if (roomId) return (
    <div style={{ minHeight:'100vh', background:C.bg, fontFamily:FONT, padding:'20px' }}>
      <div style={{ maxWidth:'1100px', margin:'0 auto', display:'flex', gap:'18px' }}>
        <div style={{ width:'250px', flexShrink:0, display:'flex', flexDirection:'column', gap:'12px' }}>
          <div style={S.card}>
            <div style={{ fontWeight:'600', color:C.text, marginBottom:'10px', fontSize:'14px' }}>Видеосвязь</div>
            {[{ref:myVideo,muted:true,show:!!localStream,label:'Моя камера'},{ref:remoteVideo,muted:false,show:true,label:'Собеседник'}].map((v,i)=>(
              <div key={i} style={{ height:'140px', background:'#111827', borderRadius:'8px', overflow:'hidden', marginBottom:'8px', position:'relative' }}>
                <video ref={v.ref} autoPlay muted={v.muted} playsInline style={{ width:'100%', height:'100%', objectFit:'cover', display:v.show?'block':'none' }}></video>
                <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'11px', textAlign:'center', paddingTop:'58px', position:'absolute', top:0, width:'100%' }}>{v.label}</div>
              </div>
            ))}
            {!localStream&&<button onClick={turnOnCamera} style={{ ...S.btn(), width:'100%', padding:'9px', fontSize:'13px' }}>🎥 Включить камеру</button>}
          </div>
          <button onClick={()=>{setRoomId('');window.history.pushState(null,null,'/');}} style={{ ...S.btn('#6b7280'), width:'100%' }}>← Выйти в кабинет</button>
        </div>
        <div style={{ flexGrow:1 }}>
          <div style={S.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px', paddingBottom:'12px', borderBottom:`1px solid ${C.border}` }}>
              <div><h2 style={{ margin:0, color:C.text, fontSize:'17px' }}>{roomId.startsWith('hw_')?'📝 Домашнее задание':'📋 Онлайн-урок'}</h2><span style={{ color:C.sub, fontSize:'11px' }}>ID: {roomId}</span></div>
              {role==='teacher'&&(
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                  {[['Текст','#10b981','text'],['Видео',C.blue,'video'],['Тест','#f59e0b','quiz'],['Рисование',C.teal,'canvas']].map(([l,c,t])=>(
                    <button key={t} onClick={()=>addBlock(t)} style={{ ...S.btn(c), padding:'7px 11px', fontSize:'12px' }}>+ {l}</button>
                  ))}
                  <button onClick={clearBoard} style={{ ...S.btn(C.danger), padding:'7px 11px', fontSize:'12px' }}>✕ Очистить</button>
                </div>
              )}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {!blocks.length&&<p style={{ color:C.sub, textAlign:'center', padding:'40px 0', fontStyle:'italic', fontSize:'14px' }}>Доска пуста...</p>}
              {blocks.map(b=>(
                <div key={b.id} style={{ padding:'14px', background:C.bg, border:`1px solid ${C.border}`, borderRadius:'8px' }}>
                  {b.type==='text'&&<textarea value={b.content} onChange={e=>updBlock(b.id,e.target.value)} style={{ ...S.inp, minHeight:'90px', resize:'vertical' }} placeholder="Текст урока..." />}
                  {b.type==='video'&&<div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    <input type="text" value={b.content} onChange={e=>updBlock(b.id,e.target.value)} placeholder="Ссылка YouTube..." style={S.inp} />
                    {b.content&&<iframe width="100%" height="315" src={b.content.includes('watch?v=')?b.content.replace('watch?v=','embed/'):b.content} frameBorder="0" allowFullScreen style={{ borderRadius:'8px' }}></iframe>}
                  </div>}
                  {b.type==='canvas'&&<DrawingBoard block={b} updateContent={updBlock} />}
                  {b.type==='quiz'&&<div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    {role==='teacher'?<>
                      <input type="text" placeholder="Вопрос..." value={b.content.question} onChange={e=>updQuiz(b.id,'question',e.target.value)} style={{ ...S.inp, fontWeight:'600' }} />
                      {b.content.options.map((opt,i)=>(
                        <div key={i} style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                          <input type="radio" name={`q-${b.id}`} checked={b.content.correctAnswer===i} onChange={()=>updQuiz(b.id,'correctAnswer',i)} />
                          <input type="text" placeholder={`Вариант ${i+1}`} value={opt} onChange={e=>{const a=[...b.content.options];a[i]=e.target.value;updQuiz(b.id,'options',a);}} style={S.inp} />
                        </div>
                      ))}
                    </>:<>
                      <h3 style={{ margin:'0 0 8px 0', color:C.text, fontSize:'15px' }}>{b.content.question||'Вопрос...'}</h3>
                      {b.content.options.map((opt,i)=>{if(!opt)return null;const sel=b.content.studentAnswer===i,cor=sel&&i===b.content.correctAnswer;return(
                        <button key={i} onClick={()=>updQuiz(b.id,'studentAnswer',i)} disabled={b.content.studentAnswer!==null} style={{ width:'100%', padding:'11px', textAlign:'left', borderRadius:'8px', border:`1px solid ${sel?(cor?'#10b981':C.danger):C.border}`, cursor:'pointer', background:sel?(cor?'#d1fae5':'#fee2e2'):'#fff', color:sel?(cor?'#065f46':'#991b1b'):C.text, fontFamily:FONT, fontSize:'14px', marginBottom:'4px' }}>{opt}</button>
                      );})}
                    </>}
                  </div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── ДАШБОРД ──────────────────────────────────────────────────────────────
  const menu = MENUS[currentUser.role]||MENUS.student;

  const renderContent = () => {
    const sec = section;

    // ════ TEACHER ════
    if (currentUser.role==='teacher') {
      if (sec==='dashboard') return (
        <div>
          <h2 style={{ margin:'0 0 20px 0', color:C.text, fontSize:'20px' }}>Показатели</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', marginBottom:'20px' }}>
            <StatCard icon="🧑‍🎓" value={students.length} label="Учеников" color={C.blue} />
            <StatCard icon="📋" value={lessons.length} label="Уроков создано" color={C.teal} />
            <StatCard icon="📝" value={hw.length} label="Отправлено ДЗ" color={C.cornflower} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
            <div style={S.card}>
              <div style={{ fontWeight:'600', color:C.text, marginBottom:'12px', fontSize:'15px' }}>Последние уроки</div>
              {lessons.slice(0,4).map((l,i)=>(
                <div key={i} onClick={()=>joinLesson(l.room_id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', borderRadius:'8px', cursor:'pointer', marginBottom:'6px', background:C.bg }}>
                  <span style={{ color:C.text, fontSize:'13px', fontWeight:'500' }}>📋 {l.room_id}</span>
                  <span style={{ color:C.blue, fontSize:'12px' }}>Открыть →</span>
                </div>
              ))}
              {!lessons.length&&<p style={{ color:C.sub, fontSize:'13px' }}>Уроков пока нет</p>}
              <button onClick={createLesson} style={{ ...S.btn(), marginTop:'10px', width:'100%', padding:'9px', fontSize:'13px' }}>+ Создать урок</button>
            </div>
            <div style={S.card}>
              <div style={{ fontWeight:'600', color:C.text, marginBottom:'12px', fontSize:'15px' }}>Последние ДЗ</div>
              {hw.slice(0,4).map((h,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', borderRadius:'8px', marginBottom:'6px', background:C.bg }}>
                  <div><div style={{ fontWeight:'500', fontSize:'13px', color:C.text }}>{h.title}</div><div style={{ fontSize:'11px', color:C.sub }}>{h.student_email}</div></div>
                  <Badge label={h.status==='completed'?'✓ Готово':'⏳ В работе'} color={h.status==='completed'?C.success:C.warning} bg={h.status==='completed'?'#d1fae5':'#fef3c7'} />
                </div>
              ))}
              {!hw.length&&<p style={{ color:C.sub, fontSize:'13px' }}>ДЗ пока нет</p>}
            </div>
          </div>
        </div>
      );

      if (sec==='students') {
        if (selectedStudent) {
          const done=studentHw.filter(h=>h.status==='completed').length;
          return (
            <div>
              <button onClick={()=>setSelectedStudent(null)} style={{ ...S.btnOut, marginBottom:'18px', display:'inline-flex', alignItems:'center', gap:'6px' }}>← Все ученики</button>
              <div style={{ ...S.card, display:'flex', gap:'18px', alignItems:'flex-start', marginBottom:'14px' }}>
                <div style={{ width:'68px', height:'68px', borderRadius:'50%', background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'26px', fontWeight:'800', flexShrink:0 }}>{selectedStudent.name[0].toUpperCase()}</div>
                <div style={{ flexGrow:1 }}>
                  <h2 style={{ margin:'0 0 4px 0', color:C.text, fontSize:'20px' }}>{selectedStudent.name}</h2>
                  <div style={{ display:'flex', gap:'16px', color:C.sub, fontSize:'13px', marginBottom:'10px' }}><span>🆔 {selectedStudent.id}</span><span>✉️ {selectedStudent.email}</span></div>
                  <div style={{ display:'flex', gap:'8px' }}>
                    <Badge label="✓ Активирован" color={C.success} bg="#d1fae5" />
                    <Badge label="Ученик" color={C.blue} bg="#dbeafe" />
                  </div>
                </div>
                <button onClick={()=>{setHwForm({email:selectedStudent.email,title:''});setSection('homework');setSelectedStudent(null);}} style={S.btn(C.teal)}>+ Назначить ДЗ</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', marginBottom:'14px' }}>
                <StatCard icon="📝" value={studentHw.length} label="Всего заданий" color={C.blue} />
                <StatCard icon="✅" value={done} label="Выполнено" color={C.success} />
                <StatCard icon="⏳" value={studentHw.length-done} label="В процессе" color={C.warning} />
              </div>
              <div style={S.card}>
                <div style={{ fontWeight:'600', color:C.text, marginBottom:'14px' }}>Домашние задания ученика</div>
                {!studentHw.length?<p style={{ color:C.sub, fontSize:'14px' }}>Заданий нет</p>:studentHw.map((h,i)=>(
                  <div key={i} onClick={()=>joinLesson(h.hw_id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', borderRadius:'8px', border:`1px solid ${C.border}`, marginBottom:'8px', cursor:'pointer', background:C.bg }}>
                    <span style={{ fontWeight:'500', color:C.text, fontSize:'14px' }}>📖 {h.title}</span>
                    <Badge label={h.status==='completed'?'Выполнено':'В процессе'} color={h.status==='completed'?C.success:C.warning} bg={h.status==='completed'?'#d1fae5':'#fef3c7'} />
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <h2 style={{ margin:0, color:C.text, fontSize:'20px' }}>Ученики</h2>
              <span style={{ color:C.sub, fontSize:'13px' }}>Всего: {students.length}</span>
            </div>
            {!students.length?<div style={{ ...S.card, textAlign:'center', padding:'40px', color:C.sub }}><div style={{ fontSize:'36px', marginBottom:'10px' }}>🧑‍🎓</div><p>Нет зарегистрированных учеников</p></div>:(
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'12px' }}>
                {students.map(s=>(
                  <div key={s.id} onClick={()=>setSelectedStudent(s)} style={{ ...S.card, cursor:'pointer', display:'flex', alignItems:'center', gap:'12px' }}>
                    <div style={{ width:'46px', height:'46px', borderRadius:'50%', background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'17px', fontWeight:'700', flexShrink:0 }}>{s.name[0].toUpperCase()}</div>
                    <div style={{ flexGrow:1, overflow:'hidden' }}>
                      <div style={{ fontWeight:'600', color:C.text, fontSize:'14px' }}>{s.name}</div>
                      <div style={{ fontSize:'12px', color:C.sub, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.email}</div>
                    </div>
                    <Badge label="Активен" color={C.success} bg="#d1fae5" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      if (sec==='lessons') return (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
            <h2 style={{ margin:0, color:C.text, fontSize:'20px' }}>Онлайн-уроки</h2>
            <button onClick={createLesson} style={S.btn()}>+ Новый урок</button>
          </div>
          {!lessons.length?<div style={{ ...S.card, textAlign:'center', padding:'40px', color:C.sub }}><div style={{ fontSize:'36px', marginBottom:'10px' }}>📋</div><p>Уроков пока нет</p><button onClick={createLesson} style={{ ...S.btn(), marginTop:'12px' }}>Создать первый</button></div>:lessons.map((l,i)=>(
            <div key={i} style={{ ...S.card, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ width:'38px', height:'38px', borderRadius:'10px', background:C.teal+'1a', display:'flex', alignItems:'center', justifyContent:'center' }}>📋</div>
                <div><div style={{ fontWeight:'600', color:C.text, fontSize:'14px' }}>Урок: {l.room_id}</div><div style={{ fontSize:'12px', color:C.sub }}>Интерактивная доска</div></div>
              </div>
              <button onClick={()=>joinLesson(l.room_id)} style={{ ...S.btn(), padding:'8px 14px', fontSize:'12px' }}>Войти →</button>
            </div>
          ))}
        </div>
      );

      if (sec==='homework') return (
        <div>
          <h2 style={{ margin:'0 0 20px 0', color:C.text, fontSize:'20px' }}>Домашние задания</h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>
            <div style={S.card}>
              <div style={{ fontWeight:'600', color:C.text, marginBottom:'14px', fontSize:'15px' }}>Назначить задание</div>
              <form onSubmit={assignHw} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <div><label style={{ fontSize:'12px', color:C.sub, display:'block', marginBottom:'4px' }}>Email ученика</label><input type="email" placeholder="student@example.com" required value={hwForm.email} onChange={e=>setHwForm({...hwForm,email:e.target.value})} style={S.inp} /></div>
                <div><label style={{ fontSize:'12px', color:C.sub, display:'block', marginBottom:'4px' }}>Название задания</label><input type="text" placeholder="Например: Present Simple — упр. 3" required value={hwForm.title} onChange={e=>setHwForm({...hwForm,title:e.target.value})} style={S.inp} /></div>
                <button type="submit" style={{ ...S.btn(C.teal), marginTop:'4px' }}>Отправить задание</button>
              </form>
            </div>
            <div style={S.card}>
              <div style={{ fontWeight:'600', color:C.text, marginBottom:'14px', fontSize:'15px' }}>Отправленные ДЗ ({hw.length})</div>
              <div style={{ maxHeight:'360px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'8px' }}>
                {!hw.length&&<p style={{ color:C.sub, fontSize:'13px' }}>Заданий пока нет</p>}
                {hw.map((h,i)=>(
                  <div key={i} onClick={()=>joinLesson(h.hw_id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 12px', background:C.bg, borderRadius:'8px', cursor:'pointer', border:`1px solid ${C.border}` }}>
                    <div><div style={{ fontWeight:'500', fontSize:'13px', color:C.text }}>{h.title}</div><div style={{ fontSize:'11px', color:C.sub }}>{h.student_email}</div></div>
                    <Badge label={h.status==='completed'?'Готово':'В работе'} color={h.status==='completed'?C.success:C.warning} bg={h.status==='completed'?'#d1fae5':'#fef3c7'} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );

      return <div style={{ ...S.card, textAlign:'center', padding:'50px', color:C.sub }}><div style={{ fontSize:'40px', marginBottom:'10px' }}>{sec==='schedule'?'📅':'⚙️'}</div><h2 style={{ color:C.text }}>{sec==='schedule'?'Расписание':'Настройки'}</h2><p>Раздел будет доступен в следующем обновлении</p></div>;
    }

    // ════ STUDENT ════
    if (currentUser.role==='student') {
      if (sec==='dashboard') {
        const done=hw.filter(h=>h.status==='completed').length;
        return (
          <div>
            <h2 style={{ margin:'0 0 20px 0', color:C.text, fontSize:'20px' }}>Мой кабинет</h2>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', marginBottom:'18px' }}>
              <StatCard icon="📝" value={hw.length} label="Всего заданий" color={C.blue} />
              <StatCard icon="✅" value={done} label="Выполнено" color={C.success} />
              <StatCard icon="⏳" value={hw.length-done} label="Осталось" color={C.warning} />
            </div>
            <div style={S.card}>
              <div style={{ fontWeight:'600', color:C.text, marginBottom:'12px', fontSize:'15px' }}>Актуальные задания</div>
              {hw.filter(h=>h.status!=='completed').slice(0,5).map((h,i)=>(
                <div key={i} onClick={()=>joinLesson(h.hw_id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', background:C.bg, borderRadius:'8px', marginBottom:'8px', cursor:'pointer', border:`1px solid ${C.border}` }}>
                  <span style={{ fontWeight:'500', color:C.text, fontSize:'13px' }}>📖 {h.title}</span>
                  <span style={{ color:C.blue, fontSize:'12px' }}>Выполнить →</span>
                </div>
              ))}
              {!hw.filter(h=>h.status!=='completed').length&&<p style={{ color:C.success, fontSize:'14px' }}>✓ Все задания выполнены!</p>}
            </div>
          </div>
        );
      }
      if (sec==='lessons') return (
        <div>
          <h2 style={{ margin:'0 0 20px 0', color:C.text, fontSize:'20px' }}>Мои уроки</h2>
          <div style={S.card}>
            <div style={{ fontWeight:'600', color:C.text, marginBottom:'8px', fontSize:'15px' }}>Подключиться к уроку</div>
            <p style={{ color:C.sub, fontSize:'13px', margin:'0 0 14px 0' }}>Введите код, который дал преподаватель:</p>
            <div style={{ display:'flex', gap:'10px' }}>
              <input type="text" placeholder="Код урока (например: x9f2a)" id="join-room" style={S.inp} />
              <button onClick={()=>joinLesson(document.getElementById('join-room').value)} style={{ ...S.btn(), whiteSpace:'nowrap' }}>Войти →</button>
            </div>
          </div>
        </div>
      );
      if (sec==='homework') return (
        <div>
          <h2 style={{ margin:'0 0 20px 0', color:C.text, fontSize:'20px' }}>Домашние задания</h2>
          {!hw.length?<div style={{ ...S.card, textAlign:'center', padding:'40px', color:C.sub }}><div style={{ fontSize:'36px', marginBottom:'10px' }}>📚</div><p>Пока нет заданий</p></div>:hw.map((h,i)=>(
            <div key={i} onClick={()=>joinLesson(h.hw_id)} style={{ ...S.card, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px', cursor:'pointer' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ width:'38px', height:'38px', borderRadius:'10px', background:C.blue+'1a', display:'flex', alignItems:'center', justifyContent:'center' }}>📖</div>
                <div><div style={{ fontWeight:'600', color:C.text, fontSize:'14px' }}>{h.title}</div><div style={{ fontSize:'11px', color:C.sub }}>Нажмите чтобы выполнить</div></div>
              </div>
              <Badge label={h.status==='completed'?'Сдано ✓':'Выполнить →'} color={h.status==='completed'?C.success:C.blue} bg={h.status==='completed'?'#d1fae5':'#dbeafe'} />
            </div>
          ))}
        </div>
      );
    }

    // ════ ADMIN ════
    if (sec==='stats') return (
      <div>
        <h2 style={{ margin:'0 0 20px 0', color:C.text, fontSize:'20px' }}>Показатели платформы</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px', marginBottom:'20px' }}>
          <StatCard icon="👥" value={users.length} label="Всего пользователей" color={C.navy} />
          <StatCard icon="🧑‍🎓" value={students.length} label="Учеников" color={C.blue} />
          <StatCard icon="👨‍🏫" value={teachers.length} label="Преподавателей" color={C.teal} />
          <StatCard icon="📋" value={lessons.length} label="Уроков" color={C.cornflower} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
          <div style={S.card}>
            <div style={{ fontWeight:'600', color:C.text, marginBottom:'12px', fontSize:'15px' }}>Последние ученики</div>
            {students.slice(0,5).map((s,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:i<4?`1px solid ${C.border}`:'none' }}>
                <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'12px', fontWeight:'700' }}>{s.name[0].toUpperCase()}</div>
                <div><div style={{ fontWeight:'500', fontSize:'13px', color:C.text }}>{s.name}</div><div style={{ fontSize:'11px', color:C.sub }}>{s.email}</div></div>
              </div>
            ))}
          </div>
          <div style={S.card}>
            <div style={{ fontWeight:'600', color:C.text, marginBottom:'12px', fontSize:'15px' }}>Преподаватели</div>
            {teachers.slice(0,5).map((t,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:i<4?`1px solid ${C.border}`:'none' }}>
                <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:C.teal, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'12px', fontWeight:'700' }}>{t.name[0].toUpperCase()}</div>
                <div><div style={{ fontWeight:'500', fontSize:'13px', color:C.text }}>{t.name}</div><div style={{ fontSize:'11px', color:C.sub }}>{t.email}</div></div>
              </div>
            ))}
            {!teachers.length&&<p style={{ color:C.sub, fontSize:'13px' }}>Нет преподавателей</p>}
          </div>
        </div>
      </div>
    );

    if (sec==='students') return (
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <h2 style={{ margin:0, color:C.text, fontSize:'20px' }}>Ученики ({students.length})</h2>
        </div>
        <div style={S.card}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:C.bg }}>{['ID','Ученик','Email','Статус'].map(h=><th key={h} style={{ padding:'11px 14px', textAlign:'left', fontSize:'12px', color:C.sub, fontWeight:'600', borderBottom:`1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>{students.map(s=>(
              <tr key={s.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={{ padding:'12px 14px', color:C.sub, fontSize:'13px' }}>{s.id}</td>
                <td style={{ padding:'12px 14px' }}><div style={{ display:'flex', alignItems:'center', gap:'10px' }}><div style={{ width:'30px', height:'30px', borderRadius:'50%', background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'11px', fontWeight:'700' }}>{s.name[0]?.toUpperCase()}</div><span style={{ fontWeight:'500', color:C.text, fontSize:'13px' }}>{s.name}</span></div></td>
                <td style={{ padding:'12px 14px', color:C.sub, fontSize:'13px' }}>{s.email}</td>
                <td style={{ padding:'12px 14px' }}><Badge label="✓ Активирован" color={C.success} bg="#d1fae5" /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    );

    if (sec==='teachers') return (
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <h2 style={{ margin:0, color:C.text, fontSize:'20px' }}>Сотрудники ({teachers.length})</h2>
        </div>
        <div style={S.card}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:C.bg }}>{['ID','Преподаватель','Email','Роль'].map(h=><th key={h} style={{ padding:'11px 14px', textAlign:'left', fontSize:'12px', color:C.sub, fontWeight:'600', borderBottom:`1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>{teachers.map(t=>(
              <tr key={t.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={{ padding:'12px 14px', color:C.sub, fontSize:'13px' }}>{t.id}</td>
                <td style={{ padding:'12px 14px' }}><div style={{ display:'flex', alignItems:'center', gap:'10px' }}><div style={{ width:'30px', height:'30px', borderRadius:'50%', background:C.teal, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'11px', fontWeight:'700' }}>{t.name[0]?.toUpperCase()}</div><span style={{ fontWeight:'500', color:C.text, fontSize:'13px' }}>{t.name}</span></div></td>
                <td style={{ padding:'12px 14px', color:C.sub, fontSize:'13px' }}>{t.email}</td>
                <td style={{ padding:'12px 14px' }}><Badge label="👨‍🏫 Преподаватель" color={C.teal} bg="#ccfbf1" /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    );

    if (sec==='lessons') return (
      <div>
        <h2 style={{ margin:'0 0 20px 0', color:C.text, fontSize:'20px' }}>Все уроки ({lessons.length})</h2>
        <div style={S.card}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:C.bg }}>{['ID урока','Действие'].map(h=><th key={h} style={{ padding:'11px 14px', textAlign:'left', fontSize:'12px', color:C.sub, fontWeight:'600', borderBottom:`1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>{lessons.map((l,i)=>(
              <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={{ padding:'12px 14px' }}><span style={{ fontWeight:'500', color:C.text, fontSize:'13px' }}>📋 {l.room_id}</span></td>
                <td style={{ padding:'12px 14px' }}><button onClick={()=>joinLesson(l.room_id)} style={{ ...S.btn(), padding:'6px 12px', fontSize:'12px' }}>Войти →</button></td>
              </tr>
            ))}</tbody>
          </table>
          {!lessons.length&&<p style={{ color:C.sub, fontSize:'13px', textAlign:'center', padding:'20px' }}>Уроков пока нет</p>}
        </div>
      </div>
    );

    if (sec==='homework') return (
      <div>
        <h2 style={{ margin:'0 0 20px 0', color:C.text, fontSize:'20px' }}>Все домашние задания</h2>
        <div style={{ ...S.card, textAlign:'center', padding:'50px', color:C.sub }}>
          <div style={{ fontSize:'40px', marginBottom:'10px' }}>📝</div>
          <p>Раздел мониторинга ДЗ всех учителей будет доступен в следующем обновлении</p>
        </div>
      </div>
    );

    return <div style={{ ...S.card, textAlign:'center', padding:'50px', color:C.sub }}><div style={{ fontSize:'40px', marginBottom:'10px' }}>⚙️</div><h2 style={{ color:C.text }}>Настройки</h2><p>Раздел будет доступен в следующем обновлении</p></div>;
  };

  return (
    <div style={{ fontFamily:FONT, display:'flex', minHeight:'100vh', background:C.bg }}>
      {/* ── Sidebar (белый, как Edvibe) ── */}
      <div style={{ width:'220px', background:'#fff', position:'fixed', top:0, left:0, bottom:0, display:'flex', flexDirection:'column', zIndex:100, borderRight:`1px solid ${C.border}` }}>
        <div style={{ padding:'18px 20px 14px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ color:C.navy, fontSize:'17px', fontWeight:'800', letterSpacing:'-0.3px' }}>DoubleLang</div>
          <div style={{ color:C.blue, fontSize:'10px', textTransform:'uppercase', letterSpacing:'1.5px', marginTop:'2px', fontWeight:'600' }}>Платформа</div>
        </div>

        <nav style={{ padding:'8px 0', flexGrow:1, overflowY:'auto' }}>
          {menu.map((item, idx) => {
            const isActive = section === item.key;
            // Разделители между группами
            const dividers = currentUser.role==='teacher' ? [2,4] : currentUser.role==='admin' ? [2,4] : [];
            return (
              <div key={item.key}>
                {dividers.includes(idx) && <div style={{ margin:'6px 16px', borderTop:`1px solid ${C.border}` }} />}
                <div onClick={()=>{setSection(item.key);setSelectedStudent(null);}}
                  style={{ padding:'10px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:'10px', color:isActive?C.sidebarActiveTxt:'#9ca3af', background:isActive?C.sidebarActive:'transparent', borderRadius:'0 8px 8px 0', marginRight:'8px', fontSize:'13.5px', fontWeight:isActive?'700':'500', transition:'all 0.12s' }}>
                  <span style={{ fontSize:'14px' }}>{item.icon}</span>
                  {item.label}
                </div>
              </div>
            );
          })}
        </nav>

        <div style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'10px' }}>
            <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:'700', fontSize:'12px', flexShrink:0 }}>{currentUser.name[0].toUpperCase()}</div>
            <div style={{ overflow:'hidden' }}>
              <div style={{ color:C.text, fontSize:'12px', fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{currentUser.name}</div>
              <div style={{ color:C.sub, fontSize:'10px' }}>{currentUser.role==='teacher'?'Преподаватель':currentUser.role==='admin'?'Администратор':'Ученик'}</div>
            </div>
          </div>
          <button onClick={logout} style={{ width:'100%', padding:'7px', background:'#fef2f2', color:'#ef4444', border:'1px solid #fecaca', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontFamily:FONT, fontWeight:'500' }}>Выйти</button>
        </div>
      </div>

      {/* ── Основной контент ── */}
      <div style={{ marginLeft:'220px', flexGrow:1 }}>
        <header style={{ background:'#fff', borderBottom:`1px solid ${C.border}`, padding:'13px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:50 }}>
          <div>
            <h1 style={{ margin:0, fontSize:'17px', fontWeight:'700', color:C.text }}>{menu.find(m=>m.key===section)?.label||'Главная'}</h1>
            <p style={{ margin:0, fontSize:'11px', color:C.sub }}>DoubleLang — онлайн-платформа обучения</p>
          </div>
          <div style={{ background:C.bg, borderRadius:'20px', padding:'6px 14px', fontSize:'12px', color:C.sub, fontWeight:'500' }}>{currentUser.email}</div>
        </header>
        <main style={{ padding:'24px 28px' }}>{renderContent()}</main>
      </div>
    </div>
  );
}
