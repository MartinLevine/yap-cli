import * as fs from 'fs';
import * as path from 'path';

/**
 * 向上查找项目根目录（包含 nest-cli.json 的目录）
 */
export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let currentDir = startDir;

  while (currentDir !== path.parse(currentDir).root) {
    const nestCliPath = path.join(currentDir, 'nest-cli.json');
    if (fs.existsSync(nestCliPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * 解析项目根目录，如果找不到则抛出错误
 */
export function resolveProjectRoot(): string {
  const root = findProjectRoot();
  if (!root) {
    throw new Error(
      'Could not find nest-cli.json. Make sure you are in a NestJS monorepo project.'
    );
  }
  return root;
}

/**
 * 检测当前目录是否在某个 app 内
 */
export function detectCurrentApp(
  root: string,
  appsDir: string = 'apps'
): string | null {
  const cwd = process.cwd();
  const appsPath = path.join(root, appsDir);

  if (!cwd.startsWith(appsPath)) {
    return null;
  }

  const relativePath = path.relative(appsPath, cwd);
  const appName = relativePath.split(path.sep)[0];

  return appName || null;
}

/**
 * 获取 app 的入口文件路径
 */
export function resolveAppEntry(
  root: string,
  appRoot: string,
  entryFile: string = 'main'
): string {
  return path.join(root, appRoot, 'src', `${entryFile}.ts`);
}

/**
 * 获取 app 的 dist 入口文件路径
 */
export function resolveDistEntry(
  distDir: string,
  appName: string,
  appRoot: string,
  entryFile: string = 'main'
): string {
  // 由于 tsc 保留目录结构，入口文件在 dist/<appName>/<appRoot>/src/main.js
  return path.join(distDir, appName, appRoot, 'src', `${entryFile}.js`);
}

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 清理目录
 */
export function cleanDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * 复制文件
 */
export function copyFile(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/**
 * 获取相对路径
 */
export function getRelativePath(from: string, to: string): string {
  const rel = path.relative(from, to);
  // 确保在 Windows 上也使用 POSIX 路径
  return rel.split(path.sep).join('/');
}

/**
 * 解析 tsconfig.json 内容（去除注释）
 */
function parseTsconfig(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  // 移除 JSON 中的注释
  const jsonWithoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
    .replace(/\/\/.*$/gm, '')         // 移除单行注释
    .replace(/,(\s*[}\]])/g, '$1');   // 移除尾随逗号

  try {
    return JSON.parse(jsonWithoutComments);
  } catch {
    return null;
  }
}

/**
 * 合并 tsconfig 配置，处理 extends
 */
function mergeTsconfig(
  config: Record<string, unknown>,
  configDir: string
): Record<string, unknown> {
  if (!config.extends) {
    return config;
  }

  const extendsPath = path.resolve(configDir, config.extends as string);
  const baseConfig = parseTsconfig(extendsPath);

  if (!baseConfig) {
    return config;
  }

  // 递归处理 base config 的 extends
  const resolvedBase = mergeTsconfig(baseConfig, path.dirname(extendsPath));

  // 合并配置：深度合并 compilerOptions
  const merged: Record<string, unknown> = { ...resolvedBase };

  for (const [key, value] of Object.entries(config)) {
    if (key === 'extends') {
      continue;
    }
    if (key === 'compilerOptions' && typeof value === 'object' && value !== null) {
      merged.compilerOptions = {
        ...(resolvedBase.compilerOptions as Record<string, unknown> || {}),
        ...(value as Record<string, unknown>),
      };
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

export interface ResolvedTsconfig {
  /** tsconfig.json 的绝对路径 */
  configPath: string;
  /** 解析后的完整配置（包含 extends 合并后的内容） */
  config: Record<string, unknown>;
  /** baseUrl 的绝对路径 */
  baseUrl: string;
  /** paths 配置 */
  paths: Record<string, string[]>;
}

/**
 * 从指定目录开始查找并解析 tsconfig.json
 *
 * 查找逻辑：
 * 1. 从 startDir 开始查找 tsconfig.json
 * 2. 如果找到，解析并处理 extends（合并继承的配置）
 * 3. 如果没找到，向上查找直到 stopDir
 */
export function resolveTsconfig(
  startDir: string,
  stopDir?: string
): ResolvedTsconfig | null {
  let currentDir = startDir;
  const root = stopDir || path.parse(startDir).root;

  while (currentDir !== root && currentDir !== path.dirname(currentDir)) {
    const tsconfigPath = path.join(currentDir, 'tsconfig.json');
    const config = parseTsconfig(tsconfigPath);

    if (config) {
      // 找到 tsconfig.json，处理 extends
      const mergedConfig = mergeTsconfig(config, currentDir);
      const compilerOptions = (mergedConfig.compilerOptions || {}) as Record<string, unknown>;

      // 解析 baseUrl（相对于 tsconfig.json 所在目录）
      const baseUrl = compilerOptions.baseUrl
        ? path.resolve(currentDir, compilerOptions.baseUrl as string)
        : currentDir;

      // 获取 paths
      const paths = (compilerOptions.paths || {}) as Record<string, string[]>;

      return {
        configPath: tsconfigPath,
        config: mergedConfig,
        baseUrl,
        paths,
      };
    }

    currentDir = path.dirname(currentDir);
  }

  return null;
}
