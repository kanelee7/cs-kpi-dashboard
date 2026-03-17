import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Deprecated endpoint. Use GitHub Action sync or /api/internal/trigger-sync.',
    },
    { status: 410 },
  );
}
