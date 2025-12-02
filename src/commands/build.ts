import * as path from 'path';
import ora from 'ora';
import type { BuildOptions } from '../types/index.js';
import {
  loadNestCliConfig,
  getApplications,
  getLibraries,
  validateServices,
} from '../core/project-scanner.js';
import { compileServices, checkTypeScriptInstalled } from '../core/compiler.js';
import { resolveProjectRoot, cleanDir, ensureDir } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

export async function buildCommand(
  services: string[],
  options: BuildOptions
): Promise<void> {
  const spinner = ora('Initializing build...').start();

  try {
    // 1. 解析项目根目录
    const root = resolveProjectRoot();

    // 2. 检查 TypeScript 是否安装
    if (!checkTypeScriptInstalled(root)) {
      spinner.fail('TypeScript is not installed');
      logger.error('Please install TypeScript: npm install -D typescript');
      process.exit(1);
    }

    spinner.text = 'Loading configuration...';

    // 3. 加载 nest-cli.json
    const nestConfig = await loadNestCliConfig(root);
    const allApps = getApplications(nestConfig);
    const allLibs = getLibraries(nestConfig);

    if (allApps.length === 0) {
      spinner.fail('No applications found in nest-cli.json');
      process.exit(1);
    }

    // 4. 确定要构建的服务
    let targetServices = allApps;

    if (services.length > 0) {
      // 验证服务名称
      const { valid, invalid } = validateServices(nestConfig, services);
      if (invalid.length > 0) {
        spinner.fail(`Unknown services: ${invalid.join(', ')}`);
        logger.info(`Available services: ${allApps.map((a) => a.name).join(', ')}`);
        process.exit(1);
      }
      // 过滤出指定的应用
      targetServices = allApps.filter((app) => valid.includes(app.name));
      if (targetServices.length === 0) {
        spinner.fail('No valid application services specified');
        process.exit(1);
      }
    }

    // 5. 确定输出目录
    const outDir = options.out
      ? path.resolve(options.out)
      : path.join(root, 'dist');

    spinner.text = `Building ${targetServices.length} service(s)...`;

    // 6. 清理输出目录（如果需要）
    if (options.clean !== false) {
      cleanDir(outDir);
    }
    ensureDir(outDir);

    spinner.succeed('Configuration loaded');
    logger.newline();

    // 7. 编译服务
    const startTime = Date.now();

    await compileServices(root, outDir, targetServices, allLibs, false);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.newline();
    logger.success(`Build completed in ${duration}s`);
    logger.info(`Output: ${outDir}`);
    logger.newline();

    // 8. 显示构建结果
    logger.info('Built services:');
    for (const service of targetServices) {
      // 实际入口文件路径（包含完整的目录结构）
      const entryPath = path.join(outDir, service.name, service.root, 'src', `${service.entryFile}.js`);
      logger.log(`  ${service.name}: ${entryPath}`);
    }

    logger.newline();
    logger.info('To start in production mode:');
    logger.log('  yap start --all');

  } catch (error) {
    spinner.fail('Build failed');
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
