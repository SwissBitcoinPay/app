import * as TaskManager from "expo-task-manager";

import { registerCardSocketTask } from "@/lib/card/card-socket";
import { logFailure } from "@/lib/log/log";

import { runCardSocketWake } from "./background-wake";
import { cardSocketOffered } from "./socket";

/*
 * Android: the task the card socket's wakes run (socket.ts, modules/card-socket: its service gives
 * each packet that comes on its connection), the app in the foreground, in the background or
 * closed: the app closed, expo-task-manager starts its JavaScript without any screen. Defined here,
 * as the bundle starts (index.ts imports this file before expo-router/entry): the service finds the
 * task by its name, which the bundle must define before it runs. Nothing on iOS nor on the web:
 * wake-task.ts.
 */

/** IRREVERSIBLE: the card socket's task's name, which expo-task-manager keeps. Never rename it. */
export const CARD_SOCKET_TASK = "card-socket-wake";

TaskManager.defineTask(CARD_SOCKET_TASK, ({ data }) => runCardSocketWake(data));

// Where the card socket is offered: its service finds the task by it.
if (cardSocketOffered()) {
  registerCardSocketTask(CARD_SOCKET_TASK).catch((error: unknown) => {
    logFailure("The card socket's task could not be registered", error);
  });
}
