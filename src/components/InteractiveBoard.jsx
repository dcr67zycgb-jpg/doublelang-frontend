import { useRef, useEffect, useState, useCallback } from 'react';

const COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ffffff'];

export default function InteractiveBoard({ socket, onSave, initialDataUrl, readOnly = false }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const lastPos = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState('pen');

  // Инициализация canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctxRef.current = ctx;
    // Белый фон
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Загрузка сохранённого состояния
  useEffect(() => {
    if (!initialDataUrl || !ctxRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      ctxRef.current.clearRect(0, 0, canvas.width, canvas.height);
      ctxRef.current.drawImage(img, 0, 0);
    };
    img.src = initialDataUrl;
  }, [initialDataUrl]);

  // Обновление параметров рисования
  useEffect(() => {
    if (!ctxRef.current) return;
    ctxRef.current.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctxRef.current.lineWidth = tool === 'eraser' ? lineWidth * 4 : lineWidth;
  }, [color, lineWidth, tool]);

  // Получение штрихов от других пользователей
  useEffect(() => {
    if (!socket) return;
    const handleDrawLine = ({ from, to, color: c, width: w }) => {
      const ctx = ctxRef.current;
      const saved = { style: ctx.strokeStyle, width: ctx.lineWidth };
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.strokeStyle = saved.style;
      ctx.lineWidth = saved.width;
    };
    socket.on('draw_line', handleDrawLine);
    return () => socket.off('draw_line', handleDrawLine);
  }, [socket]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches?.[0];
    return {
      x: ((touch?.clientX ?? e.clientX) - rect.left) * (canvasRef.current.width / rect.width),
      y: ((touch?.clientY ?? e.clientY) - rect.top) * (canvasRef.current.height / rect.height),
    };
  };

  const startDrawing = useCallback((e) => {
    if (readOnly) return;
    e.preventDefault();
    const pos = getPos(e);
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    lastPos.current = pos;
  }, [readOnly]);

  const draw = useCallback((e) => {
    if (!isDrawing || readOnly) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = ctxRef.current;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    if (socket) {
      socket.emit('draw_line', {
        from: lastPos.current,
        to: pos,
        color: tool === 'eraser' ? '#ffffff' : color,
        width: tool === 'eraser' ? lineWidth * 4 : lineWidth,
      });
    }
    lastPos.current = pos;
  }, [isDrawing, readOnly, socket, color, lineWidth, tool]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    ctxRef.current.closePath();
    setIsDrawing(false);
    if (onSave) {
      onSave(canvasRef.current.toDataURL());
    }
  }, [isDrawing, onSave]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    ctxRef.current.fillStyle = '#ffffff';
    ctxRef.current.fillRect(0, 0, canvas.width, canvas.height);
    if (onSave) onSave(canvasRef.current.toDataURL());
  };

  const C = { border: '#e5e7eb', bg: '#f2f6ff', text: '#252641', sub: '#9ca3af' };

  return (
    <div>
      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['pen', 'eraser'].map(t => (
              <button key={t} onClick={() => setTool(t)}
                style={{ padding: '5px 10px', fontSize: '12px', borderRadius: '6px', border: `1px solid ${C.border}`, cursor: 'pointer', background: tool === t ? '#252641' : '#fff', color: tool === t ? '#fff' : C.text, fontWeight: tool === t ? '600' : '400' }}>
                {t === 'pen' ? '✏️ Кисть' : '🧹 Ластик'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => { setColor(c); setTool('pen'); }}
                title={c}
                style={{ width: '20px', height: '20px', borderRadius: '50%', background: c, border: color === c && tool === 'pen' ? '2px solid #252641' : `1px solid ${C.border}`, cursor: 'pointer', padding: 0 }} />
            ))}
            <input type="color" value={color} onChange={e => { setColor(e.target.value); setTool('pen'); }}
              style={{ width: '24px', height: '24px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '4px' }} title="Любой цвет" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: C.sub }}>Толщина:</span>
            <input type="range" min="1" max="30" value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))}
              style={{ width: '80px' }} />
            <span style={{ fontSize: '11px', color: C.sub, minWidth: '20px' }}>{lineWidth}</span>
          </div>
          <button onClick={clearCanvas}
            style={{ padding: '5px 10px', fontSize: '12px', borderRadius: '6px', border: `1px solid #fca5a5`, cursor: 'pointer', background: '#fef2f2', color: '#ef4444' }}>
            Очистить
          </button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={900}
        height={500}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{ width: '100%', borderRadius: '8px', border: `1px solid ${C.border}`, touchAction: 'none', cursor: readOnly ? 'default' : (tool === 'eraser' ? 'cell' : 'crosshair'), display: 'block' }}
      />
    </div>
  );
}
