import * as fs from 'fs';
import * as path from 'path';
import type { LogsOptions } from '../types/index.js';
import { PM2Manager } from '../core/pm2-manager.js';
import { resolveProjectRoot } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

/**
 * 删除日志文件
 */
function flushLogFiles(logDir: string, service?: string): number {
  if (!fs.existsSync(logDir)) {
    return 0;
  }

  const files = fs.readdirSync(logDir);
  let deletedCount = 0;

  for (const file of files) {
    // 只处理 .log 文件
    if (!file.endsWith('.log')) continue;

    // 如果指定了服务名，只删除该服务的日志
    if (service && !file.startsWith(`${service}-`)) continue;

    const filePath = path.join(logDir, file);
    try {
      fs.unlinkSync(filePath);
      deletedCount++;
    } catch {
      // 忽略删除失败的文件
    }
  }

  return deletedCount;
}

export async function logsCommand(
  service: string | undefined,
  options: LogsOptions
): Promise<void> {
  try {
    const root = resolveProjectRoot();
    const pm2 = new PM2Manager(root);

    // 如果指定了 flush 选项，删除日志文件
    if (options.flush) {
      const logDir = path.join(root, 'logs');
      const deletedCount = flushLogFiles(logDir, service);

      if (deletedCount > 0) {
        logger.success(`Deleted ${deletedCount} log file(s)${service ? ` for ${service}` : ''}`);
      } else {
        logger.info('No log files to delete');
      }
      return;
    }

    await pm2.logs(service, options.lines, !options.follow);

  } catch (error) {
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
