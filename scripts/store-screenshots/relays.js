// Nostr relays in memory for the store screenshots (capture.mjs): every relay the page connects
// to (Playwright's routeWebSocket) is answered here, none reached. NIP-01 as far as the app uses
// it (src/lib/nostr/relay.ts): EVENT and its OK, REQ answered with the stored events then EOSE
// and kept open for new ones, CLOSE. Replaceable and addressable events keep their newest version
// (NIP-01), a deletion request (NIP-09) removes its author's events. No AUTH: the app answers a
// relay's challenge only. Signatures are not checked here: the app checks every event it reads.
// The app's own filter matching (NIP-01: ids, authors, kinds, since, until, #d, #a).
const { matchesFilter } = require("../../src/lib/nostr/relay-bounds.ts");

/** NIP-01's kind ranges. */
const isReplaceable = (kind) => kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
const isEphemeral = (kind) => kind >= 20000 && kind < 30000;
const isAddressable = (kind) => kind >= 30000 && kind < 40000;
const DELETION = 5;

const dTag = (event) => event.tags.find((tag) => tag[0] === "d")?.[1] ?? "";

/** The key under which only the newest version of an event is kept, or null. */
function versionKey(event) {
  if (isAddressable(event.kind)) return `${event.kind}:${event.pubkey}:${dTag(event)}`;
  if (isReplaceable(event.kind)) return `${event.kind}:${event.pubkey}`;
  return null;
}

/** NIP-01's order when two versions compete: the newest, then the lowest id. */
const newer = (a, b) =>
  a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);

function isEvent(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    /^[0-9a-f]{64}$/.test(value.id) &&
    /^[0-9a-f]{64}$/.test(value.pubkey) &&
    Number.isInteger(value.kind) &&
    Number.isInteger(value.created_at) &&
    Array.isArray(value.tags) &&
    value.tags.every(
      (tag) => Array.isArray(tag) && tag.every((part) => typeof part === "string")
    ) &&
    typeof value.content === "string" &&
    typeof value.sig === "string"
  );
}

/** One relay's events. */
class Store {
  /** id → event */
  events = new Map();

  /** Stores `event` as a relay does; whether it was taken. */
  add(event) {
    if (this.events.has(event.id)) return true;
    const key = versionKey(event);
    if (key) {
      for (const [id, other] of this.events) {
        if (versionKey(other) !== key) continue;
        if (newer(other, event)) return false;
        this.events.delete(id);
      }
    }
    if (event.kind === DELETION) this.applyDeletion(event);
    this.events.set(event.id, event);
    return true;
  }

  /** NIP-09: the events (`e`) and addresses (`a`) it names, of its own author only. */
  applyDeletion(request) {
    const ids = new Set(request.tags.filter((tag) => tag[0] === "e").map((tag) => tag[1]));
    const addresses = new Set(request.tags.filter((tag) => tag[0] === "a").map((tag) => tag[1]));
    for (const [id, event] of this.events) {
      if (event.pubkey !== request.pubkey || event.kind === DELETION) continue;
      const address = isAddressable(event.kind)
        ? `${event.kind}:${event.pubkey}:${dTag(event)}`
        : null;
      const addressed =
        address !== null && addresses.has(address) && event.created_at <= request.created_at;
      if (ids.has(id) || addressed) this.events.delete(id);
    }
  }

  /** The events matching one of `filters`, the newest first, each filter's `limit` applied. */
  query(filters) {
    const sorted = [...this.events.values()].sort((a, b) => (newer(a, b) ? -1 : 1));
    const found = new Map();
    for (const filter of filters) {
      const matching = sorted.filter((event) => matchesFilter(event, filter));
      const kept = filter.limit === undefined ? matching : matching.slice(0, filter.limit);
      for (const event of kept) found.set(event.id, event);
    }
    return [...found.values()].sort((a, b) => (newer(a, b) ? -1 : 1));
  }
}

/** The relays: one store per relay URL, shared by every page of the capture. */
class FakeRelays {
  /** url → Store */
  stores = new Map();
  /** Open subscriptions: { url, send, id, filters } */
  subscriptions = new Set();
  /** What no relay should receive (a malformed message): the capture fails on any. */
  errors = [];

  store(url) {
    if (!this.stores.has(url)) this.stores.set(url, new Store());
    return this.stores.get(url);
  }

  /** Answers a WebSocket the page opened (a Playwright WebSocketRoute), never connecting it. */
  serve(route) {
    const url = route.url();
    const send = (message) => route.send(JSON.stringify(message));
    const own = new Set();
    route.onMessage((data) => {
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        this.errors.push(`${url}: not JSON`);
        return;
      }
      if (!Array.isArray(message)) return void this.errors.push(`${url}: not an array`);
      const [type] = message;
      if (type === "EVENT") this.onEvent(url, send, message[1]);
      else if (type === "REQ") this.onReq(url, send, own, message[1], message.slice(2));
      else if (type === "CLOSE") this.close(own, message[1]);
      else if (type !== "AUTH") this.errors.push(`${url}: ${String(type)}`);
    });
    route.onClose(() => {
      for (const subscription of own) this.subscriptions.delete(subscription);
      own.clear();
    });
  }

  onEvent(url, send, event) {
    if (!isEvent(event)) {
      this.errors.push(`${url}: malformed event`);
      send(["OK", typeof event?.id === "string" ? event.id : "", false, "invalid: malformed"]);
      return;
    }
    const taken = isEphemeral(event.kind) ? true : this.store(url).add(event);
    send(["OK", event.id, taken, taken ? "" : "duplicate: a newer version is stored"]);
    if (!taken) return;
    for (const subscription of this.subscriptions) {
      if (subscription.url !== url) continue;
      if (subscription.filters.some((filter) => matchesFilter(event, filter))) {
        subscription.send(["EVENT", subscription.id, event]);
      }
    }
  }

  onReq(url, send, own, id, filters) {
    if (typeof id !== "string" || filters.length === 0) {
      this.errors.push(`${url}: malformed REQ`);
      return;
    }
    this.close(own, id);
    for (const event of this.store(url).query(filters)) send(["EVENT", id, event]);
    send(["EOSE", id]);
    const subscription = { url, send, id, filters };
    own.add(subscription);
    this.subscriptions.add(subscription);
  }

  close(own, id) {
    for (const subscription of own) {
      if (subscription.id !== id) continue;
      own.delete(subscription);
      this.subscriptions.delete(subscription);
    }
  }
}

module.exports = { FakeRelays };
