import * as fs from 'fs';
import * as path from 'path';
import type { NestCliConfig, NestCliProject, ResolvedService } from '../types/index.js';

/**
 * 加载 nest-cli.json 配置
 */
export async function loadNestCliConfig(root: string): Promise<NestCliConfig> {
  const configPath = path.join(root, 'nest-cli.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`nest-cli.json not found at ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content) as NestCliConfig;
}

/**
 * 获取所有应用服务
 */
export function getApplications(config: NestCliConfig): ResolvedService[] {
  const apps: ResolvedService[] = [];

  for (const [name, project] of Object.entries(config.projects)) {
    if (project.type === 'application') {
      apps.push({
        name,
        type: project.type,
        root: project.root,
        sourceRoot: project.sourceRoot,
        entryFile: project.entryFile || 'main',
        tsConfigPath: project.compilerOptions?.tsConfigPath,
      });
    }
  }

  return apps;
}

/**
 * 获取所有库
 */
export function getLibraries(config: NestCliConfig): ResolvedService[] {
  const libs: ResolvedService[] = [];

  for (const [name, project] of Object.entries(config.projects)) {
    if (project.type === 'library') {
      libs.push({
        name,
        type: project.type,
        root: project.root,
        sourceRoot: project.sourceRoot,
        entryFile: project.entryFile || 'index',
        tsConfigPath: project.compilerOptions?.tsConfigPath,
      });
    }
  }

  return libs;
}

/**
 * 根据名称获取服务
 */
export function getServiceByName(
  config: NestCliConfig,
  name: string
): ResolvedService | null {
  const project = config.projects[name];
  if (!project) {
    return null;
  }

  return {
    name,
    type: project.type,
    root: project.root,
    sourceRoot: project.sourceRoot,
    entryFile: project.entryFile || (project.type === 'application' ? 'main' : 'index'),
    tsConfigPath: project.compilerOptions?.tsConfigPath,
  };
}

/**
 * 验证服务名称是否存在
 */
export function validateServices(
  config: NestCliConfig,
  serviceNames: string[]
): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const name of serviceNames) {
    if (config.projects[name]) {
      valid.push(name);
    } else {
      invalid.push(name);
    }
  }

  return { valid, invalid };
}

/**
 * 解析 tsconfig 中的 paths 配置
 */
export function resolveTsConfigPaths(root: string): Record<string, string[]> | null {
  const tsConfigPath = path.join(root, 'tsconfig.json');

  if (!fs.existsSync(tsConfigPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(tsConfigPath, 'utf-8');
    // 简单的 JSON 解析，不处理注释
    const config = JSON.parse(content);
    return config.compilerOptions?.paths || null;
  } catch {
    return null;
  }
}
