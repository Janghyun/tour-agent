// 백엔드 WebSocket 클라이언트 (ESM, Vite 앱용).
// 메시지: {speaker,text} | {type:"card",card} | {type:"state",state} | {type:"error",text}
export function connectRoom(url, handlers = {}) {
  const ws = new WebSocket(url);
  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg?.type === "admitted") handlers.onAdmitted?.(msg);
    else if (msg?.type === "denied") handlers.onDenied?.(msg);
    else if (msg?.type === "card") handlers.onCard?.(msg.card, msg);
    else if (msg?.type === "state") handlers.onState?.(msg.state, msg);
    else if (msg?.type === "exports") handlers.onExports?.(msg.items || []);
    else if (msg?.type === "error") handlers.onError?.(msg.text, msg);
    else if (msg?.text != null) handlers.onText?.(msg);
  };
  if (handlers.onOpen) ws.onopen = () => handlers.onOpen();
  if (handlers.onClose) ws.onclose = () => handlers.onClose();
  return {
    sendChat: (speaker, text) => ws.send(JSON.stringify({ speaker, text })),
    sendAction: (action) => ws.send(JSON.stringify(action)),
    close: () => ws.close(),
    raw: ws,
  };
}
