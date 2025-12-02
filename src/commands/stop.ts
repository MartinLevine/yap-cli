import ora from 'ora';
import type { StopOptions } from '../types/index.js';
import {
  loadNestCliConfig,
  getApplications,
  validateServices,
} from '../core/project-scanner.js';
import { PM2Manager } from '../core/pm2-manager.js';
import { resolveProjectRoot } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

export async function stopCommand(
  services: string[],
  options: StopOptions
): Promise<void> {
  const spinner = ora('Stopping services...').start();

  try {
    const root = resolveProjectRoot();
    const pm2 = new PM2Manager(root);

    if (options.all) {
      // 停止所有服务
      await pm2.stop('all');
      spinner.succeed('All services stopped');
    } else if (services.length > 0) {
      // 停止指定服务
      const nestConfig = await loadNestCliConfig(root);
      const { valid, invalid } = validateServices(nestConfig, services);

      if (invalid.length > 0) {
        spinner.warn(`Unknown services (skipped): ${invalid.join(', ')}`);
      }

      for (const serviceName of valid) {
        try {
          await pm2.stop(serviceName);
          logger.service(serviceName, 'stopped');
        } catch {
          logger.warn(`Failed to stop ${serviceName} (may not be running)`);
        }
      }

      spinner.succeed(`Stopped ${valid.length} service(s)`);
    } else {
      spinner.fail('Please specify services or use --all');
      process.exit(1);
    }

  } catch (error) {
    spinner.fail('Failed to stop services');
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
