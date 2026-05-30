// packages/local-gguf-runtime/src/runtime/server-lifecycle.test.ts
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ServerLifecycleError, spawnServer } from './server-lifecycle';

function makeFakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: (sig?: string) => boolean;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 12345;
  proc.kill = vi.fn().mockReturnValue(true);
  return proc;
}

describe('spawnServer', () => {
  it('resolves to a ServerHandle once the ready-line appears', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const promise = spawnServer({
      binaryPath: '/x/server',
      modelPath: '/m.gguf',
      port: 50000,
      nCtx: 4096,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      spawnFn: fakeSpawn as never,
      readyTimeoutMs: 5000,
    });

    // Simulate ready line on stdout
    setImmediate(() => {
      fakeProc.stdout.emit('data', Buffer.from('HTTP server listening on 127.0.0.1:50000\n'));
    });

    const handle = await promise;
    expect(handle.port).toBe(50000);
    expect(handle.pid).toBe(12345);
    expect(handle.baseUrl).toBe('http://127.0.0.1:50000');
    expect(fakeSpawn).toHaveBeenCalledWith(
      '/x/server',
      expect.arrayContaining(['-m', '/m.gguf', '--port', '50000']),
      expect.any(Object),
    );
  });

  it('rejects with ServerLifecycleError(server-spawn-failed) when ready-line never arrives', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const promise = spawnServer({
      binaryPath: '/x/server',
      modelPath: '/m.gguf',
      port: 50000,
      nCtx: 4096,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      spawnFn: fakeSpawn as never,
      readyTimeoutMs: 50,
    });

    setImmediate(() => {
      fakeProc.stderr.emit('data', Buffer.from('CUDA OOM\n'));
    });

    await expect(promise).rejects.toThrowError(ServerLifecycleError);
  });

  it('rejects with server-spawn-failed when proc exits before ready', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const promise = spawnServer({
      binaryPath: '/x/server',
      modelPath: '/m.gguf',
      port: 50000,
      nCtx: 4096,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      spawnFn: fakeSpawn as never,
      readyTimeoutMs: 1000,
    });

    setImmediate(() => {
      fakeProc.stderr.emit('data', Buffer.from('failed to load model\n'));
      fakeProc.emit('exit', 1, null);
    });

    await expect(promise).rejects.toMatchObject({ error: { kind: 'server-spawn-failed' } });
  });

  it('handle.stop() sends SIGTERM and resolves on exit', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const promise = spawnServer({
      binaryPath: '/x/server',
      modelPath: '/m.gguf',
      port: 50000,
      nCtx: 4096,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      spawnFn: fakeSpawn as never,
      readyTimeoutMs: 5000,
    });
    setImmediate(() => {
      fakeProc.stdout.emit('data', Buffer.from('HTTP server listening on 127.0.0.1:50000\n'));
    });
    const handle = await promise;

    const stopPromise = handle.stop();
    setImmediate(() => fakeProc.emit('exit', 0, null));
    await stopPromise;
    expect(fakeProc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('onCrash fires when process exits after ready (unexpected exit)', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const handle = await new Promise<Awaited<ReturnType<typeof spawnServer>>>((res) => {
      const p = spawnServer({
        binaryPath: '/x/server',
        modelPath: '/m.gguf',
        port: 50000,
        nCtx: 4096,
        nGpuLayers: 35,
        nBatch: 512,
        nThreads: 8,
        spawnFn: fakeSpawn as never,
        readyTimeoutMs: 5000,
      });
      setImmediate(() => fakeProc.stdout.emit('data', Buffer.from('HTTP server listening\n')));
      p.then(res);
    });

    const crashInfo = await new Promise<{ exitCode: number | null; stderr: string }>((resolve) => {
      handle.onCrash(resolve);
      setImmediate(() => {
        fakeProc.stderr.emit('data', Buffer.from('sigsegv\n'));
        fakeProc.emit('exit', 139, null);
      });
    });

    expect(crashInfo.exitCode).toBe(139);
    expect(crashInfo.stderr).toContain('sigsegv');
  });

  it('rejects immediately with server-spawn-failed on a spawn error (ENOENT)', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const promise = spawnServer({
      binaryPath: '/does/not/exist/server',
      modelPath: '/m.gguf',
      port: 50000,
      nCtx: 4096,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      spawnFn: fakeSpawn as never,
      // Long timeout: the test proves we reject on 'error' WITHOUT waiting it out.
      readyTimeoutMs: 60_000,
    });

    setImmediate(() => {
      fakeProc.emit('error', new Error('spawn /does/not/exist/server ENOENT'));
    });

    await expect(promise).rejects.toMatchObject({ error: { kind: 'server-spawn-failed' } });
    await expect(promise).rejects.toThrowError(/ENOENT/);
  });

  it('onCrash delivers a buffered crash to a subscriber that registers after the exit', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const handle = await new Promise<Awaited<ReturnType<typeof spawnServer>>>((res) => {
      const p = spawnServer({
        binaryPath: '/x/server',
        modelPath: '/m.gguf',
        port: 50000,
        nCtx: 4096,
        nGpuLayers: 35,
        nBatch: 512,
        nThreads: 8,
        spawnFn: fakeSpawn as never,
        readyTimeoutMs: 5000,
      });
      setImmediate(() => fakeProc.stdout.emit('data', Buffer.from('HTTP server listening\n')));
      p.then(res);
    });

    // Crash happens BEFORE any onCrash subscriber registers.
    fakeProc.stderr.emit('data', Buffer.from('boom\n'));
    fakeProc.emit('exit', 1, null);

    // Late registration still receives the buffered crash info synchronously.
    const crashInfo = await new Promise<{ exitCode: number | null; stderr: string }>((resolve) => {
      handle.onCrash(resolve);
    });
    expect(crashInfo.exitCode).toBe(1);
    expect(crashInfo.stderr).toContain('boom');
  });
});
