import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { EcosystemConfig, AppConfig, GlobalConfig } from '../types/index.js';

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  env_file_pattern: '.env.{env}',
  log_dir: './logs',
  combine_logs: false,
};

const DEFAULT_APP_CONFIG: Partial<AppConfig> = {
  instances: 1,
  exec_mode: 'fork',
  max_memory_restart: '500M',
  autorestart: true,
  max_restarts: 10,
  restart_delay: 1000,
  watch: false,
  ignore_watch: ['node_modules', 'logs', 'dist', '.git'],
  merge_logs: true,
  log_date_format: 'YYYY-MM-DD HH:mm:ss',
};

/**
 * 加载 ecosystem.config.ts 配置
 */
export async function loadEcosystemConfig(
  root: string
): Promise<EcosystemConfig | null> {
  const configPath = path.join(root, 'ecosystem.config.ts');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    // 动态导入 TypeScript 配置文件
    // 需要先编译或使用 ts-node/tsx 运行
    const configUrl = pathToFileURL(configPath).href;
    const module = await import(configUrl);
    return module.default as EcosystemConfig;
  } catch (error) {
    // 如果无法加载 TS 文件，尝试加载 JS 版本
    const jsConfigPath = path.join(root, 'ecosystem.config.js');
    if (fs.existsSync(jsConfigPath)) {
      const configUrl = pathToFileURL(jsConfigPath).href;
      const module = await import(configUrl);
      return module.default as EcosystemConfig;
    }
    return null;
  }
}

/**
 * 获取 app 的完整配置（合并默认值）
 */
export function resolveAppConfig(
  appConfig: Partial<AppConfig>,
  appName: string,
  globalConfig: GlobalConfig = DEFAULT_GLOBAL_CONFIG
): AppConfig {
  const logDir = globalConfig.log_dir || './logs';

  return {
    ...DEFAULT_APP_CONFIG,
    name: appName,
    error_file: `${logDir}/${appName}-error.log`,
    out_file: `${logDir}/${appName}-out.log`,
    ...appConfig,
  } as AppConfig;
}

/**
 * 获取全局配置（合并默认值）
 */
export function resolveGlobalConfig(
  globalConfig?: Partial<GlobalConfig>
): GlobalConfig {
  return {
    ...DEFAULT_GLOBAL_CONFIG,
    ...globalConfig,
  };
}

/**
 * 生成默认的 ecosystem.config.ts 内容
 */
export function generateEcosystemConfigContent(
  appNames: string[]
): string {
  const appsConfig = appNames
    .map(
      (name) => `    {
      name: '${name}',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
    }`
    )
    .join(',\n');

  return `import type { EcosystemConfig } from 'yap-cli';

const config: EcosystemConfig = {
  apps: [
${appsConfig}
  ],

  global: {
    env_file_pattern: '.env.{env}',
    log_dir: './logs',
    combine_logs: false,
  },
};

export default config;
`;
}

/**
 * 检查 ecosystem.config 是否存在
 */
export function ecosystemConfigExists(root: string): boolean {
  return (
    fs.existsSync(path.join(root, 'ecosystem.config.ts')) ||
    fs.existsSync(path.join(root, 'ecosystem.config.js'))
  );
}
