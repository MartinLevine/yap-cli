import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';
import {
  loadNestCliConfig,
  getApplications,
} from '../core/project-scanner.js';
import {
  generateEcosystemConfigContent,
  ecosystemConfigExists,
} from '../core/config-loader.js';
import { generateEnvExampleContent } from '../core/env-loader.js';
import { resolveProjectRoot, ensureDir } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

export async function initCommand(): Promise<void> {
  const spinner = ora('Initializing Yap configuration...').start();

  try {
    const root = resolveProjectRoot();

    spinner.text = 'Loading project configuration...';

    // 加载 nest-cli.json
    const nestConfig = await loadNestCliConfig(root);
    const apps = getApplications(nestConfig);

    if (apps.length === 0) {
      spinner.fail('No applications found in nest-cli.json');
      process.exit(1);
    }

    const appNames = apps.map((app) => app.name);
    const filesCreated: string[] = [];

    // 1. 生成 ecosystem.config.ts（如果不存在）
    const ecosystemPath = path.join(root, 'ecosystem.config.ts');
    if (!ecosystemConfigExists(root)) {
      const content = generateEcosystemConfigContent(appNames);
      fs.writeFileSync(ecosystemPath, content);
      filesCreated.push('ecosystem.config.ts');
    } else {
      logger.warn('ecosystem.config.ts already exists, skipping');
    }

    // 2. 生成 .env.example（如果不存在）
    const envExamplePath = path.join(root, '.env.example');
    if (!fs.existsSync(envExamplePath)) {
      const content = generateEnvExampleContent();
      fs.writeFileSync(envExamplePath, content);
      filesCreated.push('.env.example');
    } else {
      logger.warn('.env.example already exists, skipping');
    }

    // 3. 生成 .env.development（如果不存在）
    const envDevPath = path.join(root, '.env.development');
    if (!fs.existsSync(envDevPath)) {
      const content = `# Development Environment
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
`;
      fs.writeFileSync(envDevPath, content);
      filesCreated.push('.env.development');
    }

    // 4. 生成 .env.production（如果不存在）
    const envProdPath = path.join(root, '.env.production');
    if (!fs.existsSync(envProdPath)) {
      const content = `# Production Environment
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
`;
      fs.writeFileSync(envProdPath, content);
      filesCreated.push('.env.production');
    }

    // 5. 创建 logs 目录
    const logsDir = path.join(root, 'logs');
    ensureDir(logsDir);

    // 6. 添加 .gitignore 条目（如果存在 .gitignore）
    const gitignorePath = path.join(root, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      let gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      const entriesToAdd = [
        '# Yap CLI',
        'logs/',
        '.env.local',
        '*.log',
      ];

      const missingEntries = entriesToAdd.filter(
        (entry) => !gitignore.includes(entry)
      );

      if (missingEntries.length > 0) {
        gitignore += '\n' + missingEntries.join('\n') + '\n';
        fs.writeFileSync(gitignorePath, gitignore);
        logger.info('Updated .gitignore');
      }
    }

    spinner.succeed('Yap configuration initialized');
    logger.newline();

    if (filesCreated.length > 0) {
      logger.info('Created files:');
      for (const file of filesCreated) {
        logger.log(`  ${file}`);
      }
      logger.newline();
    }

    logger.info('Detected applications:');
    for (const app of apps) {
      logger.log(`  ${app.name}`);
    }
    logger.newline();

    logger.info('Next steps:');
    logger.log('  1. Review and customize ecosystem.config.ts');
    logger.log('  2. Set up your environment variables in .env.development');
    logger.log('  3. Run "yap dev" to start development');

  } catch (error) {
    spinner.fail('Failed to initialize configuration');
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
