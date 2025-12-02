import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { ResolvedService } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { ensureDir, cleanDir, getRelativePath } from '../utils/paths.js';
import {
  generateBuildTsConfig,
  writeTempTsConfig,
  removeTempTsConfig,
} from './tsconfig-generator.js';

export interface CompileOptions {
  rootDir: string;
  outDir: string;
  service: ResolvedService;
  libs: ResolvedService[];
  clean?: boolean;
  sourceMap?: boolean;
}

/**
 * 重写 JS 文件中的路径别名为相对路径
 */
function rewritePathAliases(
  filePath: string,
  libs: ResolvedService[],
  serviceOutDir: string
): void {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  for (const lib of libs) {
    // 匹配 require("@libs/xxx") 或 require('@libs/xxx')
    const aliasPattern = new RegExp(
      `require\\(["']@libs/${lib.name}(/[^"']*)?["']\\)`,
      'g'
    );

    content = content.replace(aliasPattern, (match, subPath) => {
      modified = true;
      // 计算从当前文件到 lib 的相对路径
      const fileDir = path.dirname(filePath);
      const libDir = path.join(serviceOutDir, 'libs', lib.name, 'src');
      let relativePath = getRelativePath(fileDir, libDir);

      if (subPath) {
        // 移除 subPath 开头的 /
        relativePath = path.join(relativePath, subPath.slice(1));
      } else {
        relativePath = path.join(relativePath, 'index');
      }

      // 确保以 ./ 或 ../ 开头
      if (!relativePath.startsWith('.')) {
        relativePath = './' + relativePath;
      }

      return `require("${relativePath}")`;
    });
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
  }
}

/**
 * 递归处理目录中的所有 JS 文件
 */
function rewriteAllPathAliases(
  dir: string,
  libs: ResolvedService[],
  serviceOutDir: string
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      rewriteAllPathAliases(fullPath, libs, serviceOutDir);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      rewritePathAliases(fullPath, libs, serviceOutDir);
    }
  }
}

/**
 * 编译单个服务
 */
export async function compileService(options: CompileOptions): Promise<void> {
  const { rootDir, outDir, service, libs, clean = false, sourceMap = false } = options;

  const serviceOutDir = path.join(outDir, service.name);
  const projectRoot = path.join(rootDir, service.root);

  // 清理输出目录
  if (clean) {
    cleanDir(serviceOutDir);
  }

  // 确保输出目录存在
  ensureDir(serviceOutDir);

  // 生成临时 tsconfig
  const tsConfig = generateBuildTsConfig({
    rootDir,
    project: service,
    libs,
    outDir: serviceOutDir,
    sourceMap,
    declaration: false,
  });

  const tempConfigPath = writeTempTsConfig(projectRoot, tsConfig);

  try {
    // 执行 tsc 编译
    execSync(`npx tsc -p ${tempConfigPath}`, {
      cwd: rootDir,
      stdio: 'inherit',
    });

    // 重写路径别名为相对路径
    if (libs.length > 0) {
      rewriteAllPathAliases(serviceOutDir, libs, serviceOutDir);
    }

    // 复制 package.json（如果存在）
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      // 移除 devDependencies
      delete packageJson.devDependencies;
      // 更新入口文件
      packageJson.main = `${service.entryFile}.js`;
      fs.writeFileSync(
        path.join(serviceOutDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
    }

    logger.success(`${service.name} compiled successfully`);
  } finally {
    // 清理临时文件
    removeTempTsConfig(tempConfigPath);
  }
}

/**
 * 编译多个服务
 */
export async function compileServices(
  rootDir: string,
  outDir: string,
  services: ResolvedService[],
  libs: ResolvedService[],
  clean: boolean = true
): Promise<void> {
  // 如果需要清理，先清理整个 outDir
  if (clean) {
    cleanDir(outDir);
  }

  ensureDir(outDir);

  for (const service of services) {
    logger.info(`Building ${service.name}...`);
    await compileService({
      rootDir,
      outDir,
      service,
      libs,
      clean: false, // 已经在上面清理过了
      sourceMap: false,
    });
  }
}

/**
 * 检查 TypeScript 是否安装
 */
export function checkTypeScriptInstalled(cwd: string): boolean {
  try {
    execSync('npx tsc --version', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
