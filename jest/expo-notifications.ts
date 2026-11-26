/*
 * A fake of expo-notifications (58.1.5) for Jest (jest.setup.ts): the permission, as the user
 * answers it (`answerPermission`), the Expo push token, the Android channels; and the notifications
 * that arrive, as the app meets them: received while it runs (`receive`), tapped (`tap`, the last
 * response kept as the system keeps it) or left in the system's tray (`leaveInTray`); the local
 * notifications the app schedules (`scheduled`, replaced by identifier, `dismissed`), its handler of
 * those received while it shows (the library's own until the app sets one: it shows them all,
 * `DEFAULT_NOTIFICATION_HANDLER`). Reset before each test (jest.after-env.ts): permission not asked
 * yet, which the user grants, nothing received.
 */

export const DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT";

/** A notification as expo-notifications gives it (the fields the app reads). */
export type FakeNotification = {
  date: number;
  request: {
    identifier: string;
    content: { title: string | null; body: string | null; data: Record<string, unknown> };
    trigger: { type: "push" };
  };
};

export type FakeNotificationResponse = {
  notification: FakeNotification;
  actionIdentifier: string;
};

type Listener<T> = (event: T) => void;

export enum IosAuthorizationStatus {
  NOT_DETERMINED = 0,
  DENIED = 1,
  AUTHORIZED = 2,
  PROVISIONAL = 3,
  EPHEMERAL = 4
}

export enum AndroidImportance {
  UNKNOWN = 0,
  UNSPECIFIED = 1,
  NONE = 2,
  MIN = 3,
  LOW = 4,
  DEFAULT = 5,
  HIGH = 6,
  MAX = 7
}

type Permission = "undetermined" | "granted" | "denied";

/**
 * The handler expo-notifications sets as it is loaded (58.1.5, NotificationsHandler.ts): every
 * notification that comes while the app shows is shown, with its sound and its badge.
 */
export const DEFAULT_NOTIFICATION_HANDLER = {
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
};

const state = {
  permission: "undetermined" as Permission,
  /** What the user answers when asked. */
  answer: "granted" as Exclude<Permission, "undetermined">,
  /** Whether the system may still ask (iOS asks once). */
  canAskAgain: true,
  token: "ExponentPushToken[fake-token-0000000000]" as string | null,
  /** The token never comes (Expo's servers out of reach, a token Expo never gives). */
  tokenHangs: false,
  /** How many times the app asked for the push token (never on Android, which has no push). */
  tokenAsks: 0,
  channels: new Map<string, Record<string, unknown>>(),
  requests: 0,
  received: new Set<Listener<FakeNotification>>(),
  responses: new Set<Listener<FakeNotificationResponse>>(),
  lastResponse: null as FakeNotificationResponse | null,
  tray: [] as FakeNotification[],
  handler: DEFAULT_NOTIFICATION_HANDLER as unknown,
  /** The local notifications scheduled, in order. */
  scheduled: [] as { identifier?: string; content: Record<string, unknown>; trigger: unknown }[],
  /** Identifiers of the notifications dismissed, in order. */
  dismissed: [] as string[],
  count: 0
};

export const notifications = state;

export function answerPermission(answer: Exclude<Permission, "undetermined">): void {
  state.answer = answer;
}

export function resetNotifications(): void {
  state.permission = "undetermined";
  state.answer = "granted";
  state.canAskAgain = true;
  state.token = "ExponentPushToken[fake-token-0000000000]";
  state.tokenHangs = false;
  state.tokenAsks = 0;
  state.channels.clear();
  state.requests = 0;
  state.received.clear();
  state.responses.clear();
  state.lastResponse = null;
  state.tray = [];
  state.handler = DEFAULT_NOTIFICATION_HANDLER;
  state.scheduled = [];
  state.dismissed = [];
  state.count = 0;
}

/** A remote notification carrying `data` (a push's), received at `date` (ms). */
export function notification(
  data: Record<string, unknown>,
  date: number = Date.now(),
  title: string | null = "Card payment"
): FakeNotification {
  state.count++;
  return {
    date,
    request: {
      identifier: `notification-${state.count}`,
      content: { title, body: null, data },
      trigger: { type: "push" }
    }
  };
}

/** The app runs (foreground): its listeners get the notification, nothing is shown. */
export function receive(received: FakeNotification): void {
  for (const listener of [...state.received]) listener(received);
}

/** The user taps the notification: the app's response listeners get it, the system keeps it. */
export function tap(tapped: FakeNotification): void {
  state.tray = state.tray.filter((n) => n.request.identifier !== tapped.request.identifier);
  const response = { notification: tapped, actionIdentifier: DEFAULT_ACTION_IDENTIFIER };
  state.lastResponse = response;
  for (const listener of [...state.responses]) listener(response);
}

/** The app is not in the foreground: the notification waits in the system's tray. */
export function leaveInTray(shown: FakeNotification): void {
  state.tray.push(shown);
}

export function addNotificationReceivedListener(listener: Listener<FakeNotification>) {
  state.received.add(listener);
  return { remove: () => state.received.delete(listener) };
}

export function addNotificationResponseReceivedListener(
  listener: Listener<FakeNotificationResponse>
) {
  state.responses.add(listener);
  return { remove: () => state.responses.delete(listener) };
}

export function getLastNotificationResponse(): FakeNotificationResponse | null {
  return state.lastResponse;
}

export function clearLastNotificationResponse(): void {
  state.lastResponse = null;
}

export async function getPresentedNotificationsAsync(): Promise<FakeNotification[]> {
  return [...state.tray];
}

export async function dismissNotificationAsync(identifier: string): Promise<void> {
  state.tray = state.tray.filter((n) => n.request.identifier !== identifier);
  state.dismissed.push(identifier);
}

export function setNotificationHandler(handler: unknown): void {
  state.handler = handler;
}

export async function scheduleNotificationAsync(request: {
  identifier?: string;
  content: Record<string, unknown>;
  trigger: unknown;
}): Promise<string> {
  // expo-notifications 58.1.5 refuses an undefined trigger (`null`: at once).
  if (request.trigger === undefined) throw new TypeError("Encountered an `undefined` trigger");
  state.scheduled.push(request);
  state.count++;
  return request.identifier ?? `local-${state.count}`;
}

function status() {
  const granted = state.permission === "granted";
  return {
    status: state.permission,
    granted,
    canAskAgain: state.canAskAgain,
    expires: "never",
    ios: {
      status: granted
        ? IosAuthorizationStatus.AUTHORIZED
        : state.permission === "denied"
          ? IosAuthorizationStatus.DENIED
          : IosAuthorizationStatus.NOT_DETERMINED
    }
  };
}

/** The local notifications scheduled, as the module lists them. */
export async function getAllScheduledNotificationsAsync() {
  return state.scheduled.map((request, index) => ({
    identifier: request.identifier ?? `local-${index + 1}`,
    content: request.content,
    trigger: request.trigger
  }));
}

/** Takes back the scheduled notification `identifier`, if any. */
export async function cancelScheduledNotificationAsync(identifier: string): Promise<void> {
  state.scheduled = state.scheduled.filter((request) => request.identifier !== identifier);
}

/** As expo-notifications' enum of trigger types. */
export enum SchedulableTriggerInputTypes {
  CALENDAR = "calendar",
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
  YEARLY = "yearly",
  DATE = "date",
  TIME_INTERVAL = "timeInterval"
}

export async function getPermissionsAsync() {
  return status();
}

export async function requestPermissionsAsync() {
  state.requests++;
  if (state.canAskAgain && state.permission === "undetermined") {
    state.permission = state.answer;
    state.canAskAgain = false;
  }
  return status();
}

export async function getExpoPushTokenAsync(options?: {
  projectId?: string;
}): Promise<{ type: "expo"; data: string }> {
  state.tokenAsks += 1;
  if (state.tokenHangs) return new Promise(() => {});
  if (state.permission !== "granted") throw new Error("Notifications not allowed");
  if (!options?.projectId) throw new Error("No projectId");
  if (!state.token) throw new Error("No network");
  return { type: "expo", data: state.token };
}

export async function setNotificationChannelAsync(id: string, channel: Record<string, unknown>) {
  state.channels.set(id, channel);
  return { id, ...channel };
}
