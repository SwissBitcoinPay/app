/*
 * The card socket's task is Android's (wake-task.android.ts), which index.ts defines as the bundle
 * starts. Nothing on iOS, where the relay wakes the phone with an alert the holder touches to open
 * the app (useCardWakes.ts; the app closed, a notification service extension), nor on the web,
 * which pays no card.
 */

export {};
