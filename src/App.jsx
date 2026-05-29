import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'https://doublelang-backend.onrender.com';
const pcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function DrawingBoard({ block, updateContent }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (!block.content) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
    };
    image.src = block.content;
  }, [block.content]);

  const startDrawing = (e) => {
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    updateContent(block.id, canvasRef.current.toDataURL());
  };

  return (
    <canvas
      ref={canvasRef}
      width={750}
      height={250}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseOut={stopDrawing}
      style={{ width: '100%', cursor: 'crosshair', touchAction: 'none', background: '#fff' }}
    />
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('doublelang_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [role, setRole] = useState(() => {
    const saved = localStorage.getItem('doublelang_user');
    return saved ? JSON.parse(saved).role : null;
  });

  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [lessonsList, setLessonsList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [homeworkList, setHomeworkList] = useState([]);
  const [hwForm, setHwForm] = useState({ studentEmail: '', title: '' });

  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'student' });

  const [localStream, setLocalStream] = useState(null);
  const myVideoRef = useRef();
  const remoteVideoRef = useRef();
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  const theme = {
    card: { background: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #eaeaea', marginBottom: '16px' },
    input: { padding: '12px 16px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', outline: 'none', width: '100%', boxSizing: 'border-box' },
    btnPrimary: { padding: '12px 24px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '16px' },
    btnSuccess: { padding: '10px 20px', background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' },
    btnDanger: { padding: '10px 20px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const currentRoom = urlParams.get('lesson');

    if (currentRoom) {
      setRoomId(currentRoom);
    } else if (currentUser) {
      if (currentUser.role === 'teacher') {
        fetch(`${API_URL}/api/lessons?teacher_id=${currentUser.id}`)
          .then(res => res.json()).then(data => setLessonsList(data)).catch(console.error);
        fetch(`${API_URL}/api/homework/teacher?teacher_id=${currentUser.id}`)
          .then(res => res.json()).then(data => setHomeworkList(data)).catch(console.error);
      }
      if (currentUser.role === 'student') {
        fetch(`${API_URL}/api/homework/student?email=${currentUser.email}`)
          .then(res => res.json()).then(data => setHomeworkList(data)).catch(console.error);
      }
      if (currentUser.role === 'admin') {
        fetch(`${API_URL}/api/users`)
          .then(res => res.json()).then(data => setUsersList(data)).catch(console.error);
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (!role || !roomId) return;

    const newSocket = io(API_URL, {
      query: {
        roomId,
        userName: currentUser ? currentUser.name : 'Пользователь',
        userId: currentUser ? currentUser.id : null
      }
    });
    setSocket(newSocket);

    newSocket.on('update_board', (newBlocks) => setBlocks(newBlocks || []));

    newSocket.on('webrtc_offer', async (offer) => {
      const pc = new RTCPeerConnection(pcConfig);
      pcRef.current = pc;
      pc.onicecandidate = (e) => e.candidate && newSocket.emit('webrtc_ice_candidate', e.candidate);
      pc.ontrack = (e) => remoteVideoRef.current && (remoteVideoRef.current.srcObject = e.streams[0]);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      newSocket.emit('webrtc_answer', answer);
    });

    newSocket.on('webrtc_answer', async (ans) => pcRef.current && await pcRef.current.setRemoteDescription(ans));
    newSocket.on('webrtc_ice_candidate', async (can) => pcRef.current && await pcRef.current.addIceCandidate(new RTCIceCandidate(can)));

    return () => newSocket.disconnect();
  }, [role, roomId]);

  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authForm)
    });
    const data = await res.json();
    if (data.token) {
      setCurrentUser(data.user);
      setRole(data.user.role);
      localStorage.setItem('doublelang_user', JSON.stringify(data.user));
      localStorage.setItem('doublelang_token', data.token);
    } else if (data.id) {
      alert('Успешно! Теперь войдите.');
      setAuthMode('login');
    } else {
      alert(data.error);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setRole(null);
    localStorage.clear();
  };

  const assignHomework = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/api/homework/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacher_id: currentUser.id,
        student_email: hwForm.studentEmail,
        title: hwForm.title,
        board_content: [{ id: Date.now(), type: 'text', content: 'Решите задание здесь...' }]
      })
    });
    if (res.ok) {
      alert('Домашнее задание успешно отправлено ученику!');
      setHwForm({ studentEmail: '', title: '' });
      fetch(`${API_URL}/api/homework/teacher?teacher_id=${currentUser.id}`)
        .then(res => res.json()).then(data => setHomeworkList(data));
    }
  };

  const turnOnCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (myVideoRef.current) myVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection(pcConfig);
      pcRef.current = pc;
      pc.onicecandidate = (e) => e.candidate && socket.emit('webrtc_ice_candidate', e.candidate);
      pc.ontrack = (e) => remoteVideoRef.current && (remoteVideoRef.current.srcObject = e.streams[0]);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc_offer', offer);
    } catch (err) { console.error(err); }
  };

  const addBlock = (type) => {
    let content = '';
    if (type === 'quiz') content = { question: '', options: ['', '', '', ''], correctAnswer: 0, studentAnswer: null };
    const newBlocks = [...blocks, { id: Date.now(), type, content }];
    setBlocks(newBlocks);
    socket.emit('board_change', newBlocks);
  };

  const handleClear = () => {
    setBlocks([]);
    socket.emit('board_change', []);
  };

  const updateBlockContent = (id, text) => {
    const newBlocks = blocks.map(b => b.id === id ? { ...b, content: text } : b);
    setBlocks(newBlocks);
    socket.emit('board_change', newBlocks);
  };

  const updateQuiz = (id, field, value) => {
    const newBlocks = blocks.map(b => b.id === id ? { ...b, content: { ...b.content, [field]: value } } : b);
    setBlocks(newBlocks);
    socket.emit('board_change', newBlocks);
  };

  const createNewLesson = () => {
    const room = Math.random().toString(36).substring(7);
    window.history.pushState(null, null, '?lesson=' + room);
    setRoomId(room);
  };

  const joinLesson = (id) => {
    if (!id) return;
    window.history.pushState(null, null, '?lesson=' + id);
    setRoomId(id);
  };

  // Экран авторизации
  if (!currentUser && !roomId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', fontFamily: 'system-ui' }}>
        <div style={{ ...theme.card, width: '100%', maxWidth: '420px', padding: '32px' }}>
          <h1 style={{ textAlign: 'center', fontSize: '32px', margin: '0 0 8px 0', color: '#4F46E5', fontWeight: '800' }}>DoubleLang</h1>
          <p style={{ textAlign: 'center', color: '#6B7280', margin: '0 0 24px 0' }}>Платформа умного обучения языкам</p>

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {authMode === 'register' && (
              <>
                <input type="text" placeholder="Ваше имя" required value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} style={theme.input} />
                <select value={authForm.role} onChange={e => setAuthForm({...authForm, role: e.target.value})} style={theme.input}>
                  <option value="student">Я Ученик 🧑‍🎓</option>
                  <option value="teacher">Я Преподаватель 👨‍🏫</option>
                  <option value="admin">Я Администратор 🛠️</option>
                </select>
              </>
            )}
            <input type="email" placeholder="Электронная почта" required value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} style={theme.input} />
            <input type="password" placeholder="Пароль" required value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} style={theme.input} />
            <button type="submit" style={theme.btnPrimary}>{authMode === 'login' ? 'Войти в личный кабинет' : 'Зарегистрироваться'}</button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '20px', color: '#4F46E5', cursor: 'pointer', fontWeight: '500' }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? 'Еще нет аккаунта? Создать' : 'Уже зарегистрированы? Войти'}
          </p>
        </div>
      </div>
    );
  }

  // Экраны личных кабинетов
  if (currentUser && !roomId) {
    return (
      <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: 'system-ui', padding: '32px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', background: '#fff', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            <div>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#4F46E5' }}>DoubleLang Платформа</span>
              <h1 style={{ margin: '4px 0 0 0', fontSize: '24px', color: '#111827' }}>Привет, {currentUser.name}! 🌟</h1>
            </div>
            <button onClick={logout} style={{ padding: '8px 16px', background: '#F3F4F6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', color: '#4B5563' }}>Выйти</button>
          </div>

          {/* КАБИНЕТ УЧИТЕЛЯ */}
          {currentUser.role === 'teacher' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <div style={theme.card}>
                  <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>👨‍🏫 Проведение онлайн-уроков</h2>
                  <button onClick={createNewLesson} style={theme.btnPrimary}>+ Запустить интерактивную доску</button>
                </div>
                <div style={theme.card}>
                  <h3 style={{ margin: '0 0 12px 0' }}>Активные комнаты уроков:</h3>
                  {lessonsList.length === 0 ? <p style={{ color: 'gray' }}>Вы еще не создавали комнат.</p> : (
                    lessonsList.map((l, i) => (
                      <div key={i} onClick={() => joinLesson(l.room_id)} style={{ padding: '12px', background: '#F3F4F6', borderRadius: '8px', cursor: 'pointer', marginBottom: '8px', fontWeight: '500' }}>
                        🔗 Урок ID: {l.room_id}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div style={theme.card}>
                  <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', color: '#10B981' }}>📝 Назначить домашнее задание</h2>
                  <form onSubmit={assignHomework} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <input type="email" placeholder="Email ученика" required value={hwForm.studentEmail} onChange={e => setHwForm({...hwForm, studentEmail: e.target.value})} style={theme.input} />
                    <input type="text" placeholder="Название задания (например: Презент Симпл)" required value={hwForm.title} onChange={e => setHwForm({...hwForm, title: e.target.value})} style={theme.input} />
                    <button type="submit" style={{ ...theme.btnPrimary, background: '#10B981' }}>Отправить задание</button>
                  </form>
                </div>
                <div style={theme.card}>
                  <h3 style={{ margin: '0 0 12px 0' }}>Статус отправленных ДЗ:</h3>
                  {homeworkList.length === 0 ? <p style={{ color: 'gray' }}>Вы ещё не назначали заданий.</p> : (
                    homeworkList.map((hw, i) => (
                      <div key={i} onClick={() => joinLesson(hw.hw_id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#fff', border: '1px solid #eee', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                        <div><strong>{hw.title}</strong><br /><span style={{ fontSize: '12px', color: 'gray' }}>для {hw.student_email}</span></div>
                        <span style={{ color: hw.status === 'completed' ? 'green' : 'orange', fontWeight: 'bold' }}>{hw.status === 'completed' ? 'Выполнено' : 'В процессе'}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* КАБИНЕТ УЧЕНИКА */}
          {currentUser.role === 'student' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div style={theme.card}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>🔗 Подключение к онлайн-уроку</h2>
                <p style={{ color: '#6B7280', fontSize: '14px' }}>Введите код комнаты, который вам скинул преподаватель:</p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <input type="text" placeholder="Код (например: x9f2a)" id="join-room" style={theme.input} />
                  <button onClick={() => joinLesson(document.getElementById('join-room').value)} style={theme.btnPrimary}>Войти</button>
                </div>
              </div>
              <div style={theme.card}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', color: '#10B981' }}>📚 Мои Домашние Задания</h2>
                {homeworkList.length === 0 ? <p style={{ color: 'gray' }}>У вас пока нет назначенных домашних заданий.</p> : (
                  homeworkList.map((hw, i) => (
                    <div key={i} onClick={() => joinLesson(hw.hw_id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#F3F4F6', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                      <span>📖 <strong>{hw.title}</strong></span>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', background: hw.status === 'completed' ? '#D1FAE5' : '#FEF3C7', color: hw.status === 'completed' ? '#065F46' : '#92400E', fontSize: '13px', fontWeight: '600' }}>
                        {hw.status === 'completed' ? 'Сдано' : 'Выполнить'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* КАБИНЕТ АДМИНИСТРАТОРА */}
          {currentUser.role === 'admin' && (
            <div style={theme.card}>
              <h2 style={{ color: '#9C27B0', margin: '0 0 16px 0' }}>🛠️ Контроль пользователей DoubleLang</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F3F4F6', textAlign: 'left' }}>
                    <th style={{ padding: '12px' }}>ID</th>
                    <th style={{ padding: '12px' }}>Имя</th>
                    <th style={{ padding: '12px' }}>Email</th>
                    <th style={{ padding: '12px' }}>Роль</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px' }}>{u.id}</td>
                      <td style={{ padding: '12px', fontWeight: '600' }}>{u.name}</td>
                      <td style={{ padding: '12px' }}>{u.email}</td>
                      <td style={{ padding: '12px', color: u.role === 'teacher' ? '#2196F3' : '#FF9800' }}>{u.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    );
  }

  // Интерактивная доска
  return (
    <div style={{ minHeight: '100vh', background: '#F3F4F6', fontFamily: 'system-ui', padding: '24px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', gap: '24px' }}>

        {/* Видеосвязь */}
        <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={theme.card}>
            <h4 style={{ margin: '0 0 12px 0' }}>Видеочат класса</h4>
            <div style={{ height: '160px', background: '#111827', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px', position: 'relative' }}>
              <video ref={myVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: localStream ? 'block' : 'none' }}></video>
              {!localStream && <div style={{ color: 'white', fontSize: '13px', textAlign: 'center', paddingTop: '70px' }}>Ваша камера выключена</div>}
            </div>
            <div style={{ height: '160px', background: '#111827', borderRadius: '8px', overflow: 'hidden', position: 'relative', marginBottom: '12px' }}>
              <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }}></video>
              <div style={{ color: 'white', fontSize: '13px', textAlign: 'center', paddingTop: '70px', position: 'absolute', width: '100%', top: 0, zIndex: 0 }}>Собеседник</div>
            </div>
            {!localStream && <button onClick={turnOnCamera} style={{ ...theme.btnPrimary, width: '100%', padding: '10px' }}>Включить связь 🎥</button>}
          </div>
          <button onClick={() => window.location.href = '/'} style={{ ...theme.btnPrimary, background: '#6B7280' }}>← Выйти в меню</button>
        </div>

        {/* Интерактивная доска */}
        <div style={{ flexGrow: 1 }}>
          <div style={{ ...theme.card, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '12px' }}>
              <h2 style={{ margin: '0' }}>📋 {roomId.startsWith('hw_') ? 'Домашнее Задание' : 'Онлайн Урок'}: {roomId}</h2>
              {role === 'teacher' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => addBlock('text')} style={theme.btnSuccess}>+ Текст</button>
                  <button onClick={() => addBlock('video')} style={{ ...theme.btnSuccess, background: '#2196F3' }}>+ Видео</button>
                  <button onClick={() => addBlock('quiz')} style={{ ...theme.btnSuccess, background: '#FF9800' }}>+ Тест</button>
                  <button onClick={() => addBlock('canvas')} style={{ ...theme.btnSuccess, background: '#9C27B0' }}>+ Рисование</button>
                  <button onClick={handleClear} style={theme.btnDanger}>Очистить</button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {blocks.length === 0 && <p style={{ color: 'gray', fontStyle: 'italic' }}>Здесь пока пусто...</p>}
              {blocks.map((block) => (
                <div key={block.id} style={{ padding: '16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px' }}>

                  {block.type === 'text' && (
                    <textarea value={block.content} onChange={(e) => updateBlockContent(block.id, e.target.value)} style={{ ...theme.input, minHeight: '100px', resize: 'vertical' }} placeholder="Введите текст..." />
                  )}

                  {block.type === 'video' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <input type="text" value={block.content} onChange={(e) => updateBlockContent(block.id, e.target.value)} placeholder="Вставьте ссылку на YouTube..." style={theme.input} />
                      {block.content && <iframe width="100%" height="360" src={block.content.includes('watch?v=') ? block.content.replace('watch?v=', 'embed/') : block.content} frameBorder="0" allowFullScreen style={{ borderRadius: '8px' }}></iframe>}
                    </div>
                  )}

                  {block.type === 'canvas' && <DrawingBoard block={block} updateContent={updateBlockContent} />}

                  {block.type === 'quiz' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {role === 'teacher' ? (
                        <>
                          <input type="text" placeholder="Вопрос теста..." value={block.content.question} onChange={(e) => updateQuiz(block.id, 'question', e.target.value)} style={{ ...theme.input, fontWeight: 'bold' }} />
                          {block.content.options.map((opt, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input type="radio" name={`ans-${block.id}`} checked={block.content.correctAnswer === i} onChange={() => updateQuiz(block.id, 'correctAnswer', i)} />
                              <input type="text" placeholder={`Вариант ${i + 1}`} value={opt} onChange={(e) => {
                                const arr = [...block.content.options]; arr[i] = e.target.value; updateQuiz(block.id, 'options', arr);
                              }} style={theme.input} />
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          <h3 style={{ margin: '0 0 10px 0' }}>{block.content.question || 'Вопрос без заголовка'}</h3>
                          {block.content.options.map((opt, i) => {
                            if (!opt) return null;
                            const isSel = block.content.studentAnswer === i;
                            const isCorr = isSel && i === block.content.correctAnswer;
                            return (
                              <button key={i} onClick={() => updateQuiz(block.id, 'studentAnswer', i)} disabled={block.content.studentAnswer !== null} style={{
                                width: '100%', padding: '12px', textAlign: 'left', marginBottom: '6px', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer',
                                background: isSel ? (isCorr ? '#D1FAE5' : '#FEE2E2') : '#fff',
                                color: isSel ? (isCorr ? '#065F46' : '#991B1B') : '#000'
                              }}>{opt}</button>
                            );
                          })}
                        </>
                      )}
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
}

export default App;
