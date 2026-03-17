import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';

export const runtime = 'nodejs';

function getExpectedToken(): string {
  const token = process.env.INTERNAL_SYNC_TOKEN;
  if (!token) {
    throw new Error('INTERNAL_SYNC_TOKEN is not configured');
  }
  return token;
}

function getProvidedToken(request: Request): string {
  const direct = request.headers.get('x-sync-token');
  if (direct) return direct;

  const auth = request.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

function runSyncScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(command, ['run', 'metrics-sync'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'ignore',
    });

    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`metrics-sync exited with code ${code}`));
    });
  });
}

export async function POST(request: Request) {
  const start = Date.now();
  try {
    console.info('[api/internal/trigger-sync] start');
    const expectedToken = getExpectedToken();
    const providedToken = getProvidedToken(request);

    if (!providedToken || providedToken !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await runSyncScript();
    console.info('[api/internal/trigger-sync] success', { durationMs: Date.now() - start });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.info('[api/internal/trigger-sync] failed', { durationMs: Date.now() - start });
    const message = error instanceof Error ? error.message : 'Failed to trigger sync';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
