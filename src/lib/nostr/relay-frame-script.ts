/*
 * The script of the web app's relay frame (socket.web.ts), on its own: a socket relay, talking to
 * the page over a channel of its own. Its port goes to the page with "ready", to the page's origin
 * only; the frame then reads nothing but that channel, and the page nothing but its port: no other
 * window can post a command to the frame, nor a report to the page.
 *
 * Constant, to the character: the frame's document (`srcdoc`) inherits the web app's
 * Content-Security-Policy (public/index.html), which runs no inline script but this one, by its
 * hash (web-csp.test.ts checks that the policy names this script's). The page's origin, which
 * changes with the host (staging, each deployment's own address, production), is therefore not
 * written into it: it comes as the frame's name (`window.name`, the `name` the page gives the
 * frame). A frame without it posts nothing (an empty target origin throws), and the page falls
 * back to direct connections (FRAME_TIMEOUT_MS).
 */
export const RELAY_FRAME_SCRIPT = `
"use strict";
const sockets = new Map();
const channel = new MessageChannel();
const port = channel.port1;
const report = (message) => port.postMessage(message);
port.onmessage = (event) => {
  const command = event.data || {};
  const id = command.id;
  if (command.op === "open") {
    let socket;
    try {
      socket = new WebSocket(String(command.url));
    } catch (error) {
      report({ type: "error", id });
      report({ type: "close", id });
      return;
    }
    sockets.set(id, socket);
    socket.onopen = () => report({ type: "open", id });
    socket.onmessage = (message) => report({ type: "message", id, data: String(message.data) });
    socket.onerror = () => report({ type: "error", id });
    socket.onclose = () => {
      sockets.delete(id);
      report({ type: "close", id });
    };
  } else if (command.op === "send") {
    const socket = sockets.get(id);
    if (socket && socket.readyState === 1) socket.send(String(command.data));
  } else if (command.op === "close") {
    const socket = sockets.get(id);
    if (socket) socket.close();
  }
};
parent.postMessage({ type: "ready" }, window.name, [channel.port2]);
`;
