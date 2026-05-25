import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Компонент для совместного рисования
function DrawingBoard({ block, updateContent }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Загружаем рисунок собеседника при обновлении данных
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
    // Сохраняем рисунок как текст (Base64) и отправляем на сервер
    updateContent(block.id, canvasRef.current.toDataURL());
  };

  return (
    <canvas
      ref={canvasRef}
      width={750}
      height={300}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseOut={stopDrawing}
      style={{ width: '100%', cursor: 'crosshair', touchAction: 'none' }}
    />
  );
}

// Бесплатные сервера Google для помощи в установке P2P соединения
const pcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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
  const [authMode, setAuthMode] = useState('login'); // 'login' или 'register'
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'; // Замените VITE_API_URL на URL Render в .env для деплоя
  
  const [localStream, setLocalStream] = useState(null);
  const myVideoRef = useRef();
  const remoteVideoRef = useRef(); // Окно собеседника
  const pcRef = useRef(null); // Само соединение WebRTC
  const localStreamRef = useRef(null); // Ссылка на наш видеопоток

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const currentRoom = urlParams.get('lesson');

    if (currentRoom) {
      setRoomId(currentRoom);
    } else if (currentUser && currentUser.role === 'teacher') {
      // Запрашиваем уроки только для текущего преподавателя
      fetch(`${API_BASE_URL}/api/lessons?teacher_id=${currentUser.id}`)
        .then(res => res.json())
        .then(data => setLessonsList(data))
        .catch(err => console.error('Ошибка загрузки уроков:', err));
    }
  }, [currentUser]);

  useEffect(() => {
    if (!role || !roomId) return;

    const newSocket = io(API_BASE_URL, {
      query: { 
        roomId: roomId, 
        userName: currentUser ? currentUser.name : (role === 'teacher' ? 'Преподаватель' : 'Ученик'),
        userId: currentUser ? currentUser.id : null // Передаем ID
      }
    });
    setSocket(newSocket);

    newSocket.on('update_board', (newBlocks) => setBlocks(newBlocks || []));

    // --- ОБРАБОТКА ВХОДЯЩИХ ЗВОНКОВ WEBRTC ---
    newSocket.on('webrtc_offer', async (offer) => {
      const pc = new RTCPeerConnection(pcConfig);
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) newSocket.emit('webrtc_ice_candidate', event.candidate);
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      };

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
      }

      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      newSocket.emit('webrtc_answer', answer);
    });

    newSocket.on('webrtc_answer', async (answer) => {
      if (pcRef.current) await pcRef.current.setRemoteDescription(answer);
    });

    newSocket.on('webrtc_ice_candidate', async (candidate) => {
      if (pcRef.current) await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    });

    return () => newSocket.disconnect();
  }, [role, roomId]);

  // --- ИНИЦИАЛИЗАЦИЯ КАМЕРЫ И ЗВОНКА ---
  const turnOnCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (myVideoRef.current) myVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection(pcConfig);
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit('webrtc_ice_candidate', event.candidate);
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      };

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc_offer', offer);

    } catch (err) {
      console.error("Ошибка доступа к камере:", err);
    }
  };

  const addBlock = (type) => {
    // Если это тест, создаем структуру объекта. Иначе - пустая строка.
    let defaultContent = '';
    if (type === 'quiz') {
      defaultContent = {
        question: '',
        options: ['', '', '', ''], // 4 пустых варианта
        correctAnswer: 0, // Индекс правильного ответа
        studentAnswer: null // Что выбрал ученик
      };
    }
    const newBlocks = [...blocks, { id: Date.now(), type: type, content: defaultContent }];
    setBlocks(newBlocks);
    socket.emit('board_change', newBlocks);
  };

  // Специальная функция для обновления частей теста
  const updateQuiz = (id, field, value) => {
    const newBlocks = blocks.map(block => {
      if (block.id === id) {
        return { ...block, content: { ...block.content, [field]: value } };
      }
      return block;
    });
    setBlocks(newBlocks);
    socket.emit('board_change', newBlocks);
  };

  const updateBlockContent = (id, newContent) => {
    const newBlocks = blocks.map(block => block.id === id ? { ...block, content: newContent } : block);
    setBlocks(newBlocks);
    socket.emit('board_change', newBlocks);
  };

  // --- ФУНКЦИЯ АВТОРИЗАЦИИ ---
  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authForm)
    });
    const data = await res.json();
    if (data.token) {
      setCurrentUser(data.user);
      setRole(data.user.role); // Автоматически назначаем роль для доски
      // СОХРАНЯЕМ СЕССИЮ В БРАУЗЕР
      localStorage.setItem('doublelang_user', JSON.stringify(data.user));
      localStorage.setItem('doublelang_token', data.token);
    } else if (data.id) {
      alert('Успешная регистрация! Теперь войдите в аккаунт.');
      setAuthMode('login');
    } else {
      alert(data.error);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setRole(null);
    // ОЧИЩАЕМ ПАМЯТЬ ПРИ ВЫХОДЕ
    localStorage.removeItem('doublelang_user');
    localStorage.removeItem('doublelang_token');
    setRoomId('');
    if (socket) socket.disconnect();
    setSocket(null);
  };

  const handleClear = () => {
    setBlocks([]);
    socket.emit('board_change', []);
  };

  const createNewLesson = () => {
    const newRoom = Math.random().toString(36).substring(7);
    window.history.pushState(null, null, '?lesson=' + newRoom);
    setRoomId(newRoom);
  };

  const joinLesson = (id) => {
    window.history.pushState(null, null, '?lesson=' + id);
    setRoomId(id);
  };

  if (!currentUser && !roomId) {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '400px', margin: '50px auto', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h1 style={{ textAlign: 'center', color: '#333' }}>DoubleLang</h1>
        <h2 style={{ textAlign: 'center' }}>{authMode === 'login' ? 'Вход' : 'Регистрация'}</h2>
        
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {authMode === 'register' && (
            <>
              <input type="text" placeholder="Ваше Имя" required value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} style={{ padding: '10px' }} />
              <select value={authForm.role} onChange={e => setAuthForm({...authForm, role: e.target.value})} style={{ padding: '10px' }}>
                <option value="student">Я Ученик</option>
                <option value="teacher">Я Преподаватель</option>
                <option value="admin">Я Администратор</option>
              </select>
            </>
          )}
          <input type="email" placeholder="Email" required value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} style={{ padding: '10px' }} />
          <input type="password" placeholder="Пароль" required value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} style={{ padding: '10px' }} />
          
          <button type="submit" style={{ padding: '12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>
            {authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', cursor: 'pointer', color: '#2196F3' }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
          {authMode === 'login' ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
        </p>
      </div>
    );
  }

  if (currentUser && !roomId) {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '2px solid #eee', paddingBottom: '20px' }}>
          <h1>DoubleLang | Добро пожаловать, {currentUser.name}</h1>
          <button onClick={logout} style={{ padding: '8px 15px', background: '#ff4d4f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Выйти</button>
        </div>

        {currentUser.role === 'admin' && (
          <div>
            <h2 style={{ color: '#9C27B0' }}>🛠️ Панель Администратора</h2>
            <p>Здесь вы можете управлять всеми пользователями платформы, просматривать статистику оплат и блокировать аккаунты.</p>
            <div style={{ background: '#f3e5f5', padding: '20px', borderRadius: '8px' }}>В разработке: Список всех пользователей БД...</div>
          </div>
        )}

        {currentUser.role === 'teacher' && (
          <div>
            <h2 style={{ color: '#2196F3' }}>👨‍🏫 Кабинет Преподавателя</h2>
            <button onClick={createNewLesson} style={{ padding: '15px 20px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', marginBottom: '20px' }}>+ Создать новый урок</button>
            <h3>Ваши созданные курсы и уроки:</h3>
            {lessonsList.length === 0 ? <p>Уроков пока нет.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {lessonsList.map((lesson, index) => (
                  <button key={index} onClick={() => joinLesson(lesson.room_id)} style={{ padding: '15px', textAlign: 'left', background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '5px', cursor: 'pointer' }}>
                    Перейти в комнату: <strong>{lesson.room_id}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {currentUser.role === 'student' && (
          <div>
            <h2 style={{ color: '#FF9800' }}>🧑‍🎓 Мое обучение</h2>
            <p>Вставьте ссылку или ID урока, который отправил преподаватель, чтобы присоединиться:</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
               <input type="text" placeholder="Например: 7xb8f" id="join-input" style={{ padding: '10px', flexGrow: 1, border: '1px solid #ccc', borderRadius: '4px' }} />
               <button onClick={() => joinLesson(document.getElementById('join-input').value)} style={{ padding: '10px 20px', background: '#FF9800', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                 Присоединиться к уроку
               </button>
            </div>
            <h3 style={{ marginTop: '40px' }}>История уроков:</h3>
            <p style={{ color: 'gray' }}>Здесь будут отображаться ваши прошедшие занятия и домашние задания.</p>
          </div>
        )}
      </div>
    );
  }

  if (!role) {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
        <h1>Урок {roomId} 🎓</h1>
        <button onClick={() => setRole('teacher')} style={{ marginRight: '10px', padding: '10px' }}>Я Преподаватель 👨‍🏫</button>
        <button onClick={() => setRole('student')} style={{ padding: '10px' }}>Я Ученик 🧑‍🎓</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Урок: {roomId} | {role === 'teacher' ? 'Преподаватель' : 'Ученик'}</h2>
      
      {/* ПАНЕЛЬ ВИДЕОСВЯЗИ */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', padding: '15px', background: '#f0f2f5', borderRadius: '8px', flexWrap: 'wrap' }}>
        
        {/* Мое видео */}
        <div style={{ width: '250px', height: '180px', background: '#000', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
          <video ref={myVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: localStream ? 'block' : 'none' }}></video>
          {!localStream && <div style={{ color: 'white', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>Камера выключена</div>}
        </div>

        {/* Видео собеседника */}
        <div style={{ width: '250px', height: '180px', background: '#000', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }}></video>
          <div style={{ color: 'white', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0 }}>Собеседник</div>
        </div>
        
        {!localStream && (
          <button onClick={turnOnCamera} style={{ alignSelf: 'center', padding: '10px 20px', background: '#673ab7', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Включить камеру 🎥</button>
        )}
      </div>

      {role === 'teacher' && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
          <button onClick={() => addBlock('text')} style={{ padding: '10px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>+ Текст</button>
          <button onClick={() => addBlock('video')} style={{ padding: '10px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>+ Видео</button>
          <button onClick={() => addBlock('quiz')} style={{ padding: '10px', background: '#FF9800', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>+ Задание (Тест)</button>
          <button onClick={() => addBlock('canvas')} style={{ padding: '10px', background: '#9C27B0', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>+ Рисование 🎨</button>
          <button onClick={handleClear} style={{ padding: '10px', background: '#ff4d4f', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Очистить</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {blocks.map((block) => (
          <div key={block.id} style={{ border: '2px solid #e0e0e0', padding: '15px', borderRadius: '8px', background: '#fafafa' }}>
            {block.type === 'text' && <textarea value={block.content} onChange={(e) => updateBlockContent(block.id, e.target.value)} style={{ width: '100%', minHeight: '100px', fontSize: '18px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }} placeholder="Текст..." />}
            {block.type === 'video' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input type="text" value={block.content} onChange={(e) => updateBlockContent(block.id, e.target.value)} placeholder="Ссылка YouTube..." style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} />
                {block.content && <iframe width="100%" height="315" src={block.content.includes('watch?v=') ? block.content.replace('watch?v=', 'embed/') : block.content} frameBorder="0" allowFullScreen></iframe>}
              </div>
            )}
            {block.type === 'quiz' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {role === 'teacher' ? (
                  /* ИНТЕРФЕЙС УЧИТЕЛЯ: СОЗДАНИЕ ТЕСТА */
                  <>
                    <div style={{ background: '#fff9c4', padding: '10px', borderRadius: '4px', fontSize: '14px', marginBottom: '10px' }}>
                      Режим редактирования. Отметьте кружком правильный вариант ответа.
                    </div>
                    <input 
                      type="text" 
                      placeholder="Введите вопрос..." 
                      value={block.content.question} 
                      onChange={(e) => updateQuiz(block.id, 'question', e.target.value)} 
                      style={{ width: '100%', padding: '10px', fontSize: '18px', border: '1px solid #ccc', borderRadius: '4px', fontWeight: 'bold' }}
                    />
                    {block.content.options.map((opt, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input 
                          type="radio" 
                          name={`correct-${block.id}`} 
                          checked={block.content.correctAnswer === i} 
                          onChange={() => updateQuiz(block.id, 'correctAnswer', i)}
                          style={{ transform: 'scale(1.5)' }}
                        />
                        <input 
                          type="text" 
                          placeholder={`Вариант ${i + 1}`} 
                          value={opt} 
                          onChange={(e) => {
                            const newOptions = [...block.content.options];
                            newOptions[i] = e.target.value;
                            updateQuiz(block.id, 'options', newOptions);
                          }} 
                          style={{ flexGrow: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                        />
                      </div>
                    ))}
                    {block.content.studentAnswer !== null && (
                      <div style={{ marginTop: '10px', color: block.content.studentAnswer === block.content.correctAnswer ? 'green' : 'red', fontWeight: 'bold' }}>
                        Ученик выбрал вариант №{block.content.studentAnswer + 1}
                      </div>
                    )}
                  </>
                ) : (
                  /* ИНТЕРФЕЙС УЧЕНИКА: ПРОХОЖДЕНИЕ ТЕСТА */
                  <>
                    <h3 style={{ margin: '0 0 10px 0' }}>{block.content.question || 'Вопрос загружается...'}</h3>
                    {block.content.options.map((opt, i) => {
                      if (!opt) return null;
                      
                      const isSelected = block.content.studentAnswer === i;
                      const isCorrect = isSelected && i === block.content.correctAnswer;
                      const isWrong = isSelected && i !== block.content.correctAnswer;
                      
                      let bgColor = 'white';
                      let borderColor = '#ccc';
                      if (isSelected) {
                        bgColor = isCorrect ? '#d4edda' : '#f8d7da';
                        borderColor = isCorrect ? '#c3e6cb' : '#f5c6cb';
                      }

                      return (
                        <div key={i} style={{ padding: '10px', background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '4px', marginBottom: '5px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                            <input 
                              type="radio" 
                              name={`student-${block.id}`} 
                              checked={isSelected} 
                              onChange={() => updateQuiz(block.id, 'studentAnswer', i)}
                              disabled={block.content.studentAnswer !== null}
                            />
                            {opt}
                          </label>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
            {block.type === 'canvas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ padding: '5px 10px', background: '#f0f2f5', borderRadius: '4px', fontSize: '14px', color: 'gray' }}>
                  Совместная доска (рисуйте мышкой)
                </div>
                <div style={{ border: '1px solid #ccc', borderRadius: '4px', background: '#fff', overflow: 'hidden' }}>
                  <DrawingBoard block={block} updateContent={updateBlockContent} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
