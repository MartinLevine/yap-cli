import ora from 'ora';
import type { RestartOptions } from '../types/index.js';
import {
  loadNestCliConfig,
  getApplications,
  validateServices,
} from '../core/project-scanner.js';
import { PM2Manager } from '../core/pm2-manager.js';
import { resolveProjectRoot } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

export async function restartCommand(
  services: string[],
  options: RestartOptions
): Promise<void> {
  const spinner = ora('Restarting services...').start();

  try {
    const root = resolveProjectRoot();
    const pm2 = new PM2Manager(root);

    if (options.all) {
      // 重启所有服务
      await pm2.restart('all');
      spinner.succeed('All services restarted');
    } else if (services.length > 0) {
      // 重启指定服务
      const nestConfig = await loadNestCliConfig(root);
      const { valid, invalid } = validateServices(nestConfig, services);

      if (invalid.length > 0) {
        spinner.warn(`Unknown services (skipped): ${invalid.join(', ')}`);
      }

      for (const serviceName of valid) {
        try {
          await pm2.restart(serviceName);
          logger.service(serviceName, 'running');
        } catch {
          logger.warn(`Failed to restart ${serviceName} (may not be running)`);
        }
      }

      spinner.succeed(`Restarted ${valid.length} service(s)`);
    } else {
      spinner.fail('Please specify services or use --all');
      process.exit(1);
    }

  } catch (error) {
    spinner.fail('Failed to restart services');
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
