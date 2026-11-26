/** `promise`'s value, or null past `ms` (the promise itself goes on, its value then unused). */
export function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), Math.max(0, ms));
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}
