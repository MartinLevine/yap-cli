import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import ora from 'ora';
import type { DevOptions } from '../types/index.js';
import {
  loadNestCliConfig,
  getApplications,
  validateServices,
} from '../core/project-scanner.js';
import { loadEnvFiles } from '../core/env-loader.js';
import { PM2Manager } from '../core/pm2-manager.js';
import { resolveProjectRoot, detectCurrentApp, ensureDir, resolveTsconfig } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

// 获取 yap 包的根目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const yapRoot = path.resolve(__dirname, '../..');

// 创建 require 函数用于解析模块路径
const require = createRequire(import.meta.url);

/**
 * 解析 yap 内置模块的路径
 */
function resolveYapModule(moduleName: string): string {
  return require.resolve(moduleName, { paths: [yapRoot] });
}

export async function devCommand(
  services: string[],
  options: DevOptions
): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    // 1. 解析项目根目录
    const root = resolveProjectRoot();
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
      // 验证服务名称
      const { valid, invalid } = validateServices(nestConfig, services);
      if (invalid.length > 0) {
        spinner.fail(`Unknown services: ${invalid.join(', ')}`);
        logger.info(`Available services: ${allApps.map((a) => a.name).join(', ')}`);
        process.exit(1);
      }
      // 过滤出应用类型的服务
      targetServices = valid.filter((name) =>
        allApps.some((app) => app.name === name)
      );
      if (targetServices.length === 0) {
        spinner.fail('No valid application services specified');
        process.exit(1);
      }
    } else {
      // 尝试自动检测当前目录
      const currentApp = detectCurrentApp(root);
      if (currentApp && allApps.some((app) => app.name === currentApp)) {
        targetServices = [currentApp];
      } else {
        // 默认启动第一个应用
        targetServices = [allApps[0].name];
        logger.warn(`No service specified, using default: ${targetServices[0]}`);
      }
    }

    spinner.text = `Starting ${targetServices.length} service(s)...`;

    // 4. 加载环境变量
    const env = options.env || 'development';
    const envVars = loadEnvFiles(root, env);

    // 5. 确保日志目录存在
    const logDir = path.join(root, 'logs');
    ensureDir(logDir);

    // 6. 使用 PM2 启动服务
    const pm2 = new PM2Manager(root);

    // 先静默停止可能已经运行的同名服务（不输出 "not found" 消息）
    for (const serviceName of targetServices) {
      await pm2.deleteSilent(serviceName);
    }

    spinner.succeed('Configuration loaded');
    logger.newline();

    // 启动每个服务
    for (const serviceName of targetServices) {
      const app = allApps.find((a) => a.name === serviceName)!;
      const appDir = path.join(root, app.root);
      const entryFile = path.join(appDir, 'src', `${app.entryFile}.ts`);

      logger.service(serviceName, 'starting');

      // 解析 tsconfig：从 app 目录开始查找，处理 extends
      const tsconfig = resolveTsconfig(appDir);
      if (!tsconfig) {
        logger.warn(`No tsconfig.json found for ${serviceName}, path aliases may not work`);
      }

      // 使用 yap 内置的 tsconfig-paths 和 @swc-node/register
      const tsconfigPathsRegister = resolveYapModule('tsconfig-paths/register');
      const swcNodeRegister = resolveYapModule('@swc-node/register');

      // 构建 node 参数，使用绝对路径
      const nodeArgs = [
        '-r', tsconfigPathsRegister,
        '-r', swcNodeRegister,
      ].join(' ');

      await pm2.start({
        name: serviceName,
        script: entryFile,
        cwd: appDir,  // 使用 app 目录作为 cwd，这样 watch 才能正确监控
        interpreter: 'node',
        nodeArgs,
        watch: options.watch !== false,
        ignoreWatch: ['node_modules', 'logs', 'dist', '.git', '*.log'],
        watchDelay: 1000,
        env: {
          ...envVars,
          NODE_ENV: env,
          // 使用解析到的 tsconfig 路径
          TS_NODE_PROJECT: tsconfig?.configPath || path.join(root, 'tsconfig.json'),
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
    logger.newline();

    // 根据 detach 选项决定前台还是后台运行
    if (options.detach) {
      // 后台模式：显示帮助信息后退出
      logger.info('Running in detached mode');
      logger.newline();
      logger.info('Commands:');
      logger.log('  yap logs [service]  - View logs');
      logger.log('  yap list            - List all services');
      logger.log('  yap stop [service]  - Stop service(s)');
      logger.log('  yap restart [service] - Restart service(s)');
    } else {
      // 前台模式：显示日志，Ctrl+C 时清理
      logger.info('Press Ctrl+C to stop all services');
      logger.newline();

      // 使用 logsWithProcess 获取子进程引用，lines=0 表示只显示新日志
      const logsProcess = pm2.logsWithProcess(
        targetServices.length === 1 ? targetServices[0] : undefined,
        0,  // 不显示历史日志，只显示新日志
        true
      );

      // 设置 Ctrl+C 清理逻辑
      let isCleaningUp = false;
      const cleanup = async () => {
        if (isCleaningUp) return;
        isCleaningUp = true;

        // 先杀死日志进程
        logsProcess.kill('SIGTERM');

        logger.newline();
        logger.info('Stopping services...');

        for (const serviceName of targetServices) {
          await pm2.deleteSilent(serviceName);
          logger.service(serviceName, 'stopped');
        }

        logger.newline();
        logger.success('All services stopped');
        process.exit(0);
      };

      // 监听 SIGINT (Ctrl+C) 和 SIGTERM
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      // 等待日志进程结束（正常情况下不会结束，除非被 cleanup 杀死）
      await new Promise<void>((resolve) => {
        logsProcess.on('close', () => {
          resolve();
        });
      });
    }

  } catch (error) {
    spinner.fail('Failed to start services');
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
