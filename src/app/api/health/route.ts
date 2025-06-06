import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // 使用应用中配置的 Prisma 实例

export async function GET() {
  try {
    // 检查数据库连接
    // Prisma Client 在首次查询时会自动尝试连接，所以一个简单的查询可以测试连接
    await prisma.user.findFirst(); // 尝试一个轻量级查询，例如查找第一个用户

    return NextResponse.json({ status: 'healthy' }, { status: 200 });
  } catch (error: any) {
    console.error('Health check failed:', error);
    // 在生产中，避免泄露过于详细的错误信息
    const errorMessage = process.env.NODE_ENV === 'production' ? 'Database connectivity issue' : error.message;
    return NextResponse.json(
      { status: 'unhealthy', error: errorMessage },
      { status: 500 }
    );
  } finally {
    // 通常 Prisma Client 会管理连接池，不需要每次都手动断开
    // await prisma.$disconnect(); // 在 serverless 环境或短生命周期任务中可能需要
  }
}