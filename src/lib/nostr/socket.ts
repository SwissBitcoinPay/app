/**
 * The WebSocket of a relay connection in the apps: React Native's. Its handshake names nothing
 * of the app (as their sources show): Android (OkHttp) sends the relay's own address
 * as `Origin` and OkHttp's default user agent, iOS (SocketRocket) the relay's address as `Origin`
 * and no user agent. Web: socket.web.ts, same API.
 */
export function createRelaySocket(url: string): WebSocket {
  return new WebSocket(url);
}
