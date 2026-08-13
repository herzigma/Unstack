import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './withTimeout';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('resolves with the promise result when it settles before the timeout', async () => {
    const promise = Promise.resolve('fast');
    const onTimeout = vi.fn().mockReturnValue('fallback');

    const result = await withTimeout(promise, 1000, onTimeout);

    expect(result).toBe('fast');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('resolves with the fallback when the promise has not settled by the deadline', async () => {
    let resolveSlow: (value: string) => void;
    const slow = new Promise<string>((resolve) => {
      resolveSlow = resolve;
    });
    const onTimeout = vi.fn().mockReturnValue('fallback');

    const resultPromise = withTimeout(slow, 1000, onTimeout);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await resultPromise).toBe('fallback');
    expect(onTimeout).toHaveBeenCalledTimes(1);

    // The loser settling later must not throw or produce an unhandled rejection.
    resolveSlow!('too late');
    await vi.runAllTimersAsync();
  });

  it('does not throw when the losing promise rejects after the timeout has already resolved', async () => {
    let rejectSlow: (error: Error) => void;
    const slow = new Promise<string>((_resolve, reject) => {
      rejectSlow = reject;
    });
    const settled = slow.catch(() => null);

    const resultPromise = withTimeout(settled, 1000, () => 'fallback');
    await vi.advanceTimersByTimeAsync(1000);

    expect(await resultPromise).toBe('fallback');

    rejectSlow!(new Error('late failure'));
    await vi.runAllTimersAsync();
  });
});
