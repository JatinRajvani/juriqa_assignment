import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';

export async function GET() {
  try {
    await connectToDatabase();
    return NextResponse.json(
      {
        status: 'ok',
        message: 'Database connection successful',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Database connection health check failed:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Database connection failed',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
