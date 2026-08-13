/**
 * Races a promise against a timeout, resolving with the timeout's fallback value
 * if it fires first. The losing promise is NOT cancelled -- it keeps running per
 * normal JS semantics, so callers relying on its side effects (e.g. populating a
 * cache) still get them once it eventually settles.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => T | Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
