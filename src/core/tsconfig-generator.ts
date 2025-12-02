import * as fs from 'fs';
import * as path from 'path';
import type { ResolvedService } from '../types/index.js';
import { getRelativePath } from '../utils/paths.js';

interface TsConfigGeneratorOptions {
  rootDir: string;
  project: ResolvedService;
  libs: ResolvedService[];
  outDir: string;
  sourceMap?: boolean;
  declaration?: boolean;
}

/**
 * 为构建生成临时 tsconfig
 */
export function generateBuildTsConfig(options: TsConfigGeneratorOptions): object {
  const { rootDir, project, libs, outDir, sourceMap = false, declaration = false } = options;

  const projectRoot = path.join(rootDir, project.root);
  const relativeOutDir = getRelativePath(projectRoot, outDir);

  // 计算相对于项目根目录的 monorepo 根目录
  const relativeMonorepoRoot = getRelativePath(projectRoot, rootDir);

  // 生成 paths 映射
  const paths: Record<string, string[]> = {};
  for (const lib of libs) {
    const libSrcRelative = getRelativePath(
      projectRoot,
      path.join(rootDir, lib.sourceRoot)
    );
    // 使用 nest-cli.json 中的别名格式，通常是 @libs/xxx
    paths[`@libs/${lib.name}`] = [libSrcRelative];
    paths[`@libs/${lib.name}/*`] = [`${libSrcRelative}/*`];
  }

  // 生成 include 列表
  const include = ['src/**/*'];
  for (const lib of libs) {
    const libSrcRelative = getRelativePath(
      projectRoot,
      path.join(rootDir, lib.sourceRoot)
    );
    include.push(`${libSrcRelative}/**/*`);
  }

  // 查找要继承的 tsconfig
  const possibleExtends = [
    './tsconfig.app.json',
    './tsconfig.json',
  ];

  let extendsPath: string | undefined;
  for (const ext of possibleExtends) {
    const fullPath = path.join(projectRoot, ext);
    if (fs.existsSync(fullPath)) {
      extendsPath = ext;
      break;
    }
  }

  // rootDir 需要设置为 monorepo 根目录，这样才能包含 libs
  // 但我们需要调整 outDir 来保持扁平结构
  const config: Record<string, unknown> = {
    compilerOptions: {
      baseUrl: '.',
      // rootDir 设置为 monorepo 根目录（相对于当前项目）
      rootDir: relativeMonorepoRoot || '.',
      outDir: relativeOutDir,
      paths,
      declaration,
      sourceMap,
      // 确保输出扁平结构
      composite: false,
      incremental: false,
    },
    include,
    exclude: ['node_modules', 'dist', 'test', '**/*spec.ts', '**/*.test.ts'],
  };

  if (extendsPath) {
    config.extends = extendsPath;
  } else {
    // 如果没有可继承的配置，添加必要的编译选项
    Object.assign(config.compilerOptions as Record<string, unknown>, {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      target: 'ES2022',
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      skipLibCheck: true,
      strictNullChecks: true,
      forceConsistentCasingInFileNames: true,
    });
  }

  return config;
}

/**
 * 写入临时 tsconfig 文件
 */
export function writeTempTsConfig(
  projectRoot: string,
  config: object
): string {
  const tempConfigPath = path.join(projectRoot, 'tsconfig.build.tmp.json');
  fs.writeFileSync(tempConfigPath, JSON.stringify(config, null, 2));
  return tempConfigPath;
}

/**
 * 删除临时 tsconfig 文件
 */
export function removeTempTsConfig(tempConfigPath: string): void {
  if (fs.existsSync(tempConfigPath)) {
    fs.unlinkSync(tempConfigPath);
  }
}
