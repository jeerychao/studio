// scripts/reset-admin-password.ts
// 这个脚本用于在紧急情况下重置管理员密码，无需旧密码验证。
// 请谨慎使用，并确保只有授权人员才能在服务器上执行。

import { PrismaClient } from '@prisma/client';
import { encrypt } from '../src/lib/crypto-utils'; // 调整路径以匹配您的项目结构
import readline from 'readline/promises';
import { logger } from '../src/lib/logger'; // 使用项目定义的logger

const prisma = new PrismaClient();

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  logger.info("--- 管理员密码重置脚本启动 ---", undefined, "ResetAdminPasswordScript");
  console.log("--- 管理员密码重置脚本 ---");
  console.log("警告：此操作将直接修改数据库中的用户密码，请谨慎操作。");

  const adminEmail = await rl.question('请输入要重置密码的管理员账户邮箱 (例如 admin@example.com): ');
  if (!adminEmail || adminEmail.trim() === "") {
    logger.error("错误: 管理员邮箱不能为空。", undefined, "ResetAdminPasswordScript");
    console.error('错误: 管理员邮箱不能为空。');
    rl.close();
    await prisma.$disconnect();
    process.exit(1);
  }

  const newPassword = await rl.question(`请输入管理员账户 "${adminEmail}" 的新密码: `);
  if (!newPassword || newPassword.trim() === "") {
    logger.error("错误: 新密码不能为空。", undefined, "ResetAdminPasswordScript");
    console.error('错误: 新密码不能为空。');
    rl.close();
    await prisma.$disconnect();
    process.exit(1);
  }

  // 基础密码策略检查 (可以根据您的需求加强)
  if (newPassword.length < 8) {
    logger.warn(`警告: 用户输入的新密码长度小于8位: ${newPassword.length}位。`, { email: adminEmail }, "ResetAdminPasswordScript");
    console.warn('警告: 新密码长度较短，建议至少8位。');
  }
  // 可以在这里添加更复杂的密码策略检查，例如大小写、数字、特殊字符等。

  const confirmPassword = await rl.question('请再次输入新密码以确认: ');
  rl.close();

  if (newPassword !== confirmPassword) {
    logger.error("错误: 两次输入的密码不匹配。", { email: adminEmail }, "ResetAdminPasswordScript");
    console.error('错误: 两次输入的密码不匹配。操作已取消。');
    await prisma.$disconnect();
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: adminEmail },
      include: { role: true } // 包含角色信息以供校验
    });

    if (!user) {
      logger.error(`错误: 未找到邮箱为 "${adminEmail}" 的用户。`, { email: adminEmail }, "ResetAdminPasswordScript");
      console.error(`错误: 未找到邮箱为 "${adminEmail}" 的用户。`);
      await prisma.$disconnect();
      process.exit(1);
    }

    // 可选：检查用户是否确实是管理员角色
    // 您需要知道管理员角色的确切名称或ID
    // const adminRoleName = 'Administrator'; // 或者您的管理员角色名称
    // if (user.role?.name !== adminRoleName) {
    //   logger.error(`错误: 用户 "${adminEmail}" (ID: ${user.id}) 不是管理员角色 (${user.role?.name || '未知角色'})。密码未重置。`, { email: adminEmail, userId: user.id, role: user.role?.name }, "ResetAdminPasswordScript");
    //   console.error(`错误: 用户 "${adminEmail}" 不是管理员角色。密码未重置。`);
    //   await prisma.$disconnect();
    //   process.exit(1);
    // }

    const encryptedPassword = encrypt(newPassword);

    await prisma.user.update({
      where: { email: adminEmail },
      data: { password: encryptedPassword },
    });

    logger.info(`成功: 管理员 "${adminEmail}" (ID: ${user.id}) 的密码已重置。`, { email: adminEmail, userId: user.id }, "ResetAdminPasswordScript");
    console.log(`\n成功! 管理员 "${adminEmail}" 的密码已重置。`);
    console.log("请确保新密码安全保存。");

    // 考虑在此处添加一个审计日志记录到数据库
    // 由于这是带外操作，可能需要手动或通过脚本的其他部分来确保审计
    // 例如:
    // await prisma.auditLog.create({
    //   data: {
    //     action: 'admin_password_reset_via_script',
    //     username: 'System/Script', // 或执行脚本的操作员标识
    //     details: `Password for user ${adminEmail} (ID: ${user.id}) was reset via server script.`,
    //     // userId: user.id, // 关联到被操作的用户
    //   }
    // });
    // logger.info(`已为管理员 "${adminEmail}" 的密码重置操作记录审计日志。`, { email: adminEmail, userId: user.id }, "ResetAdminPasswordScript");


  } catch (error) {
    logger.error('重置密码时发生严重错误:', error as Error, { email: adminEmail }, "ResetAdminPasswordScript");
    console.error('重置密码时发生错误:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    logger.info("--- 管理员密码重置脚本结束 ---", undefined, "ResetAdminPasswordScript");
  }
}

main();
