import { NextResponse } from 'next/server';

// Stable per-Node-process identifier. Survives HMR (cached on globalThis), changes
// only when the dev server is actually restarted. Used by use-session.ts to clear
// a persisted client session when the backend process has changed.
const g = globalThis as unknown as { __ESSAY_GRADER_INSTANCE_ID__?: string };
if (!g.__ESSAY_GRADER_INSTANCE_ID__) {
  g.__ESSAY_GRADER_INSTANCE_ID__ = `${process.pid}-${Date.now()}`;
}
const INSTANCE_ID = g.__ESSAY_GRADER_INSTANCE_ID__;

export async function GET() {
  return NextResponse.json({ instanceId: INSTANCE_ID });
}
