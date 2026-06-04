/* 백엔드 WebSocket 클라이언트 (프레임워크 무관, UMD).
 *
 * 브라우저: <script src="ws.js"> → window.TA_WS.connectRoom
 * node:    const { connectRoom } = require("./ws.js")  (node 22+ 전역 WebSocket)
 *
 * 백엔드 메시지: {speaker,text} | {type:"card",card} | {type:"state",state} | {type:"error",text}
 * 보내는 것:     채팅 {speaker,text} · 액션 {action:...}
 */
(function (root) {
  function connectRoom(url, handlers) {
    handlers = handlers || {};
    const ws = new WebSocket(url);
    ws.onmessage = function (ev) {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (msg && msg.type === "card") handlers.onCard && handlers.onCard(msg.card, msg);
      else if (msg && msg.type === "state") handlers.onState && handlers.onState(msg.state, msg);
      else if (msg && msg.type === "error") handlers.onError && handlers.onError(msg.text, msg);
      else if (msg && msg.text != null) handlers.onText && handlers.onText(msg);
    };
    if (handlers.onOpen) ws.onopen = function () { handlers.onOpen(); };
    return {
      sendChat: function (speaker, text) {
        ws.send(JSON.stringify({ speaker: speaker, text: text }));
      },
      sendAction: function (action) {
        ws.send(JSON.stringify(action));
      },
      close: function () { ws.close(); },
      raw: ws,
    };
  }

  const api = { connectRoom: connectRoom };
  root.TA_WS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
