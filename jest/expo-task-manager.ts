/*
 * A fake of expo-task-manager (58.0.12) for Jest (jest.setup.ts): the tasks the app defines
 * (`defineTask`, at its bundle's start), and their runs as the system asks them (`runTask`: on
 * Android, the card socket's service runs its task for each packet, the app in the foreground, in
 * the background or closed, jest/card-socket.ts). What the real module does with a run's result and
 * its errors is kept: an error is logged and the run ends (TaskManager.ts).
 */

type Body = {
  data: unknown;
  error: { code: string | number; message: string } | null;
  executionInfo: { eventId: string; taskName: string };
};

type Executor = (body: Body) => Promise<unknown>;

const tasks = new Map<string, Executor>();
let events = 0;

export function defineTask(taskName: string, executor: Executor): void {
  if (!taskName || typeof executor !== "function") return;
  tasks.set(taskName, executor);
}

export function isTaskDefined(taskName: string): boolean {
  return tasks.has(taskName);
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

/** Runs the task `taskName` with `data` as the system would: resolves once the run ends. */
export async function runTask(taskName: string, data: unknown): Promise<unknown> {
  const executor = tasks.get(taskName);
  if (!executor) throw new Error(`No task ${taskName} defined`);
  events += 1;
  try {
    return await executor({
      data,
      error: null,
      executionInfo: { eventId: `event-${events}`, taskName }
    });
  } catch (error) {
    // TaskManager.ts: `console.error(\`TaskManager: Task "${taskName}" failed:\`, error)`.
    console.error(`TaskManager: Task "${taskName}" failed:`, error);
    return null;
  }
}
