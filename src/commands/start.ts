import * as path from 'path';
import * as fs from 'fs';
import ora from 'ora';
import type { StartOptions } from '../types/index.js';
import {
  loadNestCliConfig,
  getApplications,
  validateServices,
} from '../core/project-scanner.js';
import { loadEnvFiles } from '../core/env-loader.js';
import { PM2Manager } from '../core/pm2-manager.js';
import { resolveProjectRoot, ensureDir, resolveDistEntry } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

export async function startCommand(
  services: string[],
  options: StartOptions
): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    // 1. 解析项目根目录
    const root = resolveProjectRoot();
    const distDir = path.join(root, 'dist');

    // 检查 dist 目录是否存在
    if (!fs.existsSync(distDir)) {
      spinner.fail('No build output found');
      logger.error('Please run "yap build" first');
      process.exit(1);
    }

    spinner.text = 'Loading configuration...';

    // 2. 加载 nest-cli.json
    const nestConfig = await loadNestCliConfig(root);
    const allApps = getApplications(nestConfig);

    if (allApps.length === 0) {
      spinner.fail('No applications found in nest-cli.json');
      process.exit(1);
    }

    // 3. 确定要启动的服务
    let targetServices: string[];

    if (options.all) {
      targetServices = allApps.map((app) => app.name);
    } else if (services.length > 0) {
      const { valid, invalid } = validateServices(nestConfig, services);
      if (invalid.length > 0) {
        spinner.fail(`Unknown services: ${invalid.join(', ')}`);
        process.exit(1);
      }
      targetServices = valid.filter((name) =>
        allApps.some((app) => app.name === name)
      );
    } else {
      spinner.fail('Please specify services or use --all');
      logger.info(`Available services: ${allApps.map((a) => a.name).join(', ')}`);
      process.exit(1);
    }

    // 验证编译产物存在
    for (const serviceName of targetServices) {
      const app = allApps.find((a) => a.name === serviceName)!;
      const entryFile = resolveDistEntry(distDir, serviceName, app.root, app.entryFile);
      if (!fs.existsSync(entryFile)) {
        spinner.fail(`Build output not found for ${serviceName}`);
        logger.error(`Expected: ${entryFile}`);
        logger.info('Please run "yap build" first');
        process.exit(1);
      }
    }

    spinner.text = `Starting ${targetServices.length} service(s)...`;

    // 4. 加载环境变量
    const env = options.env || 'production';
    const envVars = loadEnvFiles(root, env);

    // 5. 确保日志目录存在
    const logDir = path.join(root, 'logs');
    ensureDir(logDir);

    // 6. 使用 PM2 启动服务
    const pm2 = new PM2Manager(root);

    // 先停止可能已经运行的同名服务
    for (const serviceName of targetServices) {
      try {
        await pm2.delete(serviceName);
      } catch {
        // 忽略错误
      }
    }

    spinner.succeed('Configuration loaded');
    logger.newline();

    // 启动每个服务
    for (const serviceName of targetServices) {
      const app = allApps.find((a) => a.name === serviceName)!;
      const entryFile = resolveDistEntry(distDir, serviceName, app.root, app.entryFile);

      logger.service(serviceName, 'starting');

      await pm2.start({
        name: serviceName,
        script: entryFile,
        cwd: root,
        watch: false,
        env: {
          ...envVars,
          NODE_ENV: env,
        },
        errorFile: path.join(logDir, `${serviceName}-error.log`),
        outFile: path.join(logDir, `${serviceName}-out.log`),
        logDateFormat: 'YYYY-MM-DD HH:mm:ss',
        mergeLogs: true,
        autorestart: true,
        maxRestarts: 10,
        restartDelay: 1000,
      });

      logger.service(serviceName, 'running');
    }

    logger.newline();
    logger.success(`Started ${targetServices.length} service(s) in ${env} mode`);

  } catch (error) {
    spinner.fail('Failed to start services');
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
