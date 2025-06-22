import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

const getBaseUrl = () => {
  return process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.EXTERNAL_PORT || '3000'}`;
};

export async function OPTIONS() {
  const baseUrl = getBaseUrl();
  
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': baseUrl,
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      },
    }
  );
}

export async function GET() {
  const headersList = headers();
  const origin = headersList.get('origin') || getBaseUrl();

  try {
    // A lightweight but effective check
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      { 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || 'unknown',
        environment: process.env.NODE_ENV,
        server: {
          port: process.env.PORT || '3000',
          external_port: process.env.EXTERNAL_PORT || '3000',
          created_at: process.env.CREATED_AT,
          created_by: process.env.CREATED_BY
        }
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
      }
    );
  } catch (error: any) {
    logger.error('Health check failed: Database connection error.', error, { context: 'api/health' });
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'A database connectivity issue was detected.' 
      : error.message;

    return NextResponse.json(
      { 
        status: 'unhealthy', 
        error: "Database connection failed.",
        details: errorMessage,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        created_at: process.env.CREATED_AT,
        created_by: process.env.CREATED_BY
      },
      {
        status: 503, // Service Unavailable
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
      }
    );
  }
}
