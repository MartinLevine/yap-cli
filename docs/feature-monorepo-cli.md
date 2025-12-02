# Yap - Monorepo CLI 工具设计文档

## 1. 背景与问题

### 1.1 现有问题

NestJS CLI 在 monorepo 模式下存在以下限制：

1. **`nest start` 只能启动默认服务**：不方便微服务开发场景
2. **输出目录结构问题**：使用 tsc 编译时，输出目录会保留完整路径结构（如 `dist/apps/api-gateway/src/main.js`），而 `nest start` 期望的是 `dist/main.js`
3. **webpack 打包的复杂性**：NestJS 默认使用 webpack，增加了构建复杂度
4. **缺乏服务编排能力**：无法方便地同时启动/管理多个服务

### 1.2 期望的 Monorepo 模式

- libs 不单独编译，而是随着 app 一起被编译
- 开发时可以灵活启动单个或多个服务
- 构建时统一输出到根目录 `dist/`，扁平结构
- 内置 PM2 集成，支持服务编排

---

## 2. 核心原理

### 2.1 开发模式 (dev)

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI dev 命令                          │
├─────────────────────────────────────────────────────────────┤
│  1. 解析 nest-cli.json，获取项目配置                          │
│  2. 加载 tsconfig paths 映射（用于 libs 解析）                │
│  3. 使用 @swc-node/register + tsconfig-paths 运行 TS        │
│  4. 通过 PM2 API 管理进程（watch 模式自动重启）               │
└─────────────────────────────────────────────────────────────┘

运行时依赖链：
node --import @swc-node/register/esm-register
     -r tsconfig-paths/register
     apps/<service>/src/main.ts
```

**为什么选择 @swc-node/register：**

| 方案 | 性能 | 类型检查 | 配置复杂度 |
|------|------|----------|------------|
| ts-node | 慢 | 支持 | 低 |
| ts-node + transpileOnly | 中等 | 无 | 低 |
| @swc-node/register | 快 (4-5x) | 无 | 中 |
| tsx (esbuild) | 快 | 无 | 低 |

选择 `@swc-node/register` 因为：
- 基于 Rust 的 SWC，性能最佳
- 支持 ESM 和 CommonJS
- 可配合 `tsconfig-paths` 解析路径别名

**路径别名解析：**

由于 SWC 本身不处理路径别名的运行时解析，需要配合 `tsconfig-paths/register`：

```typescript
// 运行时会这样启动
node -r tsconfig-paths/register \
     -r @swc-node/register \
     apps/api-gateway/src/main.ts
```

### 2.2 构建模式 (build)

```
┌─────────────────────────────────────────────────────────────┐
│                       CLI build 命令                         │
├─────────────────────────────────────────────────────────────┤
│  1. 清理 dist/ 目录                                          │
│  2. 遍历所有 apps                                            │
│  3. 为每个 app 生成临时 tsconfig（调整 paths 和 outDir）      │
│  4. 使用 tsc 编译，输出扁平结构                               │
│  5. 复制 package.json 和其他必要文件                         │
└─────────────────────────────────────────────────────────────┘

输出结构：
dist/
├── api-gateway/
│   ├── main.js
│   ├── app/
│   │   ├── app.module.js
│   │   ├── app.controller.js
│   │   └── app.service.js
│   └── package.json
├── user-svc/
│   ├── main.js
│   └── ...
└── docker-compose.yml (可选生成)
```

**扁平结构实现原理：**

问题：当 tsconfig 的 `baseUrl` 指向根目录时，tsc 会保留完整路径结构。

解决方案：为每个 app 动态生成临时 tsconfig：

```json
// 临时生成的 tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "rootDir": ".",  // 关键：设置 rootDir 为当前 app 目录
    "outDir": "../../dist/api-gateway",
    "paths": {
      "@libs/resource": ["../../libs/resource/src"],
      "@libs/resource/*": ["../../libs/resource/src/*"]
    }
  },
  "include": [
    "src/**/*",
    "../../libs/resource/src/**/*"  // 将 libs 包含进编译
  ]
}
```

这样 libs 代码会被编译并内联到每个 app 的输出中。

### 2.3 PM2 集成

```
┌─────────────────────────────────────────────────────────────┐
│                       PM2 集成架构                           │
├─────────────────────────────────────────────────────────────┤
│  CLI ─────spawn────> pm2 start ecosystem.config.js          │
│                                                              │
│  ecosystem.config.ts (自动生成/用户自定义)                   │
│  ├── apps: [...]                                            │
│  ├── env_file: .env.development                             │
│  └── log_file: ./logs/                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 命令设计

### 3.1 命令总览

| 命令 | 描述 | 示例 |
|------|------|------|
| `yap dev [services...]` | 开发模式启动服务 | `yap dev api-gateway user-svc` |
| `yap dev --all` | 启动所有服务 | `yap dev --all` |
| `yap build [services...]` | 构建服务 | `yap build` |
| `yap start [services...]` | 生产模式启动 | `yap start --all` |
| `yap stop [services...]` | 停止服务 | `yap stop api-gateway` |
| `yap restart [services...]` | 重启服务 | `yap restart --all` |
| `yap logs [service]` | 查看日志 | `yap logs api-gateway` |
| `yap list` | 列出所有服务状态 | `yap list` |
| `yap init` | 初始化配置文件 | `yap init` |

### 3.2 命令详细设计

#### `yap dev [services...]`

```bash
# 启动指定服务
yap dev api-gateway
yap dev api-gateway user-svc

# 启动所有服务
yap dev --all

# 在子目录下运行（自动检测当前服务）
cd apps/api-gateway && yap dev

# 指定环境
yap dev api-gateway --env development
yap dev api-gateway --env staging
```

**参数：**
- `services`: 服务名称列表（可选，逗号分隔或空格分隔）
- `--all, -a`: 启动所有服务
- `--env, -e <env>`: 环境名称，默认 `development`
- `--watch, -w`: 监听文件变化（默认开启）
- `--no-watch`: 禁用文件监听

**行为：**
1. 解析 `nest-cli.json` 获取项目配置
2. 检查/生成 `ecosystem.config.ts`
3. 加载 `.env.<env>` 环境变量
4. 使用 PM2 启动服务（开发模式）

#### `yap build [services...]`

```bash
# 构建所有服务
yap build

# 构建指定服务
yap build api-gateway user-svc

# 指定输出目录
yap build --out ./output
```

**参数：**
- `services`: 服务名称列表（可选）
- `--out, -o <dir>`: 输出目录，默认 `./dist`
- `--clean`: 构建前清理输出目录（默认开启）
- `--no-clean`: 不清理输出目录

**行为：**
1. 清理输出目录
2. 为每个服务生成临时 tsconfig
3. 执行 tsc 编译
4. 复制 package.json 到各服务目录
5. 可选：生成 docker-compose.yml

#### `yap start [services...]`

```bash
# 生产模式启动所有服务
yap start --all

# 启动指定服务
yap start api-gateway --env production
```

**参数：**
- `services`: 服务名称列表
- `--all, -a`: 启动所有服务
- `--env, -e <env>`: 环境名称，默认 `production`

**行为：**
1. 检查 `dist/` 目录是否存在编译产物
2. 使用 PM2 启动编译后的 JS 文件

#### `yap init`

```bash
yap init
```

**行为：**
1. 检测项目结构
2. 生成 `ecosystem.config.ts` 默认配置
3. 生成 `.env.example` 模板

---

## 4. 配置文件设计

### 4.1 ecosystem.config.ts

```typescript
import type { EcosystemConfig } from 'yap-cli';

const config: EcosystemConfig = {
  apps: [
    {
      name: 'api-gateway',
      // 实例数量
      instances: 1,
      // 执行模式: 'fork' | 'cluster'
      exec_mode: 'fork',
      // 内存限制（超出自动重启）
      max_memory_restart: '500M',
      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // 日志配置
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/api-gateway-error.log',
      out_file: './logs/api-gateway-out.log',
      merge_logs: true,
      // 重启策略
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      // 监听配置（仅开发模式）
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],
    },
    // 更多服务...
  ],

  // 全局配置
  global: {
    // 环境变量文件路径模板
    env_file_pattern: '.env.{env}',
    // 日志根目录
    log_dir: './logs',
    // 是否合并 stderr 到 stdout
    combine_logs: false,
  },
};

export default config;
```

### 4.2 环境变量管理

```
项目根目录/
├── .env                    # 基础环境变量（所有环境共享）
├── .env.development        # 开发环境
├── .env.staging           # 预发布环境
├── .env.production        # 生产环境
└── .env.local             # 本地覆盖（不提交到 git）
```

**加载顺序（后者覆盖前者）：**
1. `.env`
2. `.env.<environment>`
3. `.env.local`

### 4.3 默认 ecosystem.config.ts 模板

```typescript
// ecosystem.config.ts
import type { EcosystemConfig } from 'yap-cli';

const config: EcosystemConfig = {
  apps: [], // CLI 会根据 nest-cli.json 自动填充

  global: {
    env_file_pattern: '.env.{env}',
    log_dir: './logs',
    combine_logs: false,
  },
};

export default config;
```

---

## 5. 项目结构

```
yap/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # CLI 入口
│   ├── cli.ts                # Commander 配置
│   ├── commands/
│   │   ├── dev.ts            # dev 命令
│   │   ├── build.ts          # build 命令
│   │   ├── start.ts          # start 命令
│   │   ├── stop.ts           # stop 命令
│   │   ├── restart.ts        # restart 命令
│   │   ├── logs.ts           # logs 命令
│   │   ├── list.ts           # list 命令
│   │   └── init.ts           # init 命令
│   ├── core/
│   │   ├── project-scanner.ts    # 扫描项目结构
│   │   ├── config-loader.ts      # 加载配置
│   │   ├── tsconfig-generator.ts # 生成临时 tsconfig
│   │   ├── compiler.ts           # 编译逻辑
│   │   └── pm2-manager.ts        # PM2 进程管理
│   ├── utils/
│   │   ├── env-loader.ts     # 环境变量加载
│   │   ├── logger.ts         # 日志工具
│   │   ├── paths.ts          # 路径处理
│   │   └── template.ts       # 模板生成
│   └── types/
│       ├── config.ts         # 配置类型定义
│       └── nest-cli.ts       # nest-cli.json 类型
├── templates/
│   ├── ecosystem.config.ts   # 默认 ecosystem 模板
│   └── env.example           # 默认 .env 模板
└── bin/
    └── yap.js                # 可执行文件入口
```

---

## 6. 实现步骤

### Phase 1: 基础框架 (MVP)

1. **项目初始化**
   - 创建项目结构
   - 配置 TypeScript + Commander
   - 配置打包工具（用于生成二进制）

2. **核心模块实现**
   - `project-scanner.ts`: 解析 nest-cli.json
   - `config-loader.ts`: 加载 ecosystem.config.ts
   - `env-loader.ts`: 加载环境变量

3. **dev 命令实现**
   - 使用 @swc-node/register + tsconfig-paths 运行
   - PM2 spawn 集成
   - watch 模式支持

4. **build 命令实现**
   - 临时 tsconfig 生成
   - tsc 编译调用
   - 扁平输出结构

### Phase 2: 完善功能

5. **PM2 完整集成**
   - start/stop/restart 命令
   - logs 命令
   - list 命令

6. **init 命令**
   - ecosystem.config.ts 生成
   - .env 模板生成

7. **错误处理与日志**
   - 友好的错误提示
   - 彩色日志输出

### Phase 3: 打包分发

8. **二进制打包**
   - 使用 pkg 或 esbuild + sea 打包成二进制
   - 跨平台支持 (macOS, Linux, Windows)

9. **发布**
   - npm 发布
   - GitHub Releases 发布二进制

---

## 7. 核心代码示例

### 7.1 dev 命令核心逻辑

```typescript
// src/commands/dev.ts
import { spawn } from 'child_process';
import { loadNestCliConfig } from '../core/project-scanner';
import { loadEnvFile } from '../utils/env-loader';
import { resolveProjectRoot, resolveAppEntry } from '../utils/paths';

interface DevOptions {
  all?: boolean;
  env?: string;
  watch?: boolean;
}

export async function devCommand(
  services: string[],
  options: DevOptions
): Promise<void> {
  const root = resolveProjectRoot();
  const nestConfig = await loadNestCliConfig(root);

  // 确定要启动的服务
  let targetServices: string[];
  if (options.all) {
    targetServices = Object.keys(nestConfig.projects)
      .filter(name => nestConfig.projects[name].type === 'application');
  } else if (services.length > 0) {
    targetServices = services;
  } else {
    // 自动检测当前目录
    targetServices = [detectCurrentService(root)];
  }

  // 加载环境变量
  const env = loadEnvFile(root, options.env || 'development');

  // 为每个服务启动 PM2 进程
  for (const service of targetServices) {
    const project = nestConfig.projects[service];
    const entryFile = resolveAppEntry(root, project);

    await startDevProcess(service, entryFile, {
      env,
      watch: options.watch !== false,
      root,
    });
  }
}

async function startDevProcess(
  name: string,
  entryFile: string,
  options: { env: NodeJS.ProcessEnv; watch: boolean; root: string }
): Promise<void> {
  const args = [
    'pm2', 'start',
    entryFile,
    '--name', name,
    '--interpreter', 'node',
    '--node-args', '-r tsconfig-paths/register -r @swc-node/register',
    '--watch', options.watch ? 'true' : 'false',
    '--cwd', options.root,
  ];

  spawn('npx', args, {
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
  });
}
```

### 7.2 build 命令核心逻辑

```typescript
// src/commands/build.ts
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadNestCliConfig } from '../core/project-scanner';
import { generateBuildTsConfig } from '../core/tsconfig-generator';

interface BuildOptions {
  out?: string;
  clean?: boolean;
}

export async function buildCommand(
  services: string[],
  options: BuildOptions
): Promise<void> {
  const root = resolveProjectRoot();
  const nestConfig = await loadNestCliConfig(root);
  const outDir = options.out || path.join(root, 'dist');

  // 清理输出目录
  if (options.clean !== false) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  // 确定要构建的服务
  const targetServices = services.length > 0
    ? services
    : Object.keys(nestConfig.projects)
        .filter(name => nestConfig.projects[name].type === 'application');

  // 收集所有 libs
  const libs = Object.entries(nestConfig.projects)
    .filter(([_, config]) => config.type === 'library')
    .map(([name, config]) => ({ name, ...config }));

  // 为每个服务构建
  for (const service of targetServices) {
    const project = nestConfig.projects[service];
    const serviceOutDir = path.join(outDir, service);

    console.log(`Building ${service}...`);

    // 生成临时 tsconfig
    const tempTsConfig = generateBuildTsConfig(root, project, libs, serviceOutDir);
    const tempConfigPath = path.join(root, project.root, 'tsconfig.build.tmp.json');

    fs.writeFileSync(tempConfigPath, JSON.stringify(tempTsConfig, null, 2));

    try {
      // 执行 tsc 编译
      execSync(`tsc -p ${tempConfigPath}`, {
        cwd: root,
        stdio: 'inherit',
      });

      // 复制 package.json
      copyPackageJson(root, project, serviceOutDir);

      console.log(`✓ ${service} built successfully`);
    } finally {
      // 清理临时文件
      fs.unlinkSync(tempConfigPath);
    }
  }

  console.log(`\nBuild completed: ${outDir}`);
}
```

### 7.3 tsconfig 生成器

```typescript
// src/core/tsconfig-generator.ts
import * as path from 'path';

interface ProjectConfig {
  root: string;
  sourceRoot: string;
  entryFile: string;
}

interface LibConfig {
  name: string;
  root: string;
  sourceRoot: string;
}

export function generateBuildTsConfig(
  rootDir: string,
  project: ProjectConfig,
  libs: LibConfig[],
  outDir: string
): object {
  const projectRoot = path.join(rootDir, project.root);
  const relativeOutDir = path.relative(projectRoot, outDir);

  // 生成 paths 映射
  const paths: Record<string, string[]> = {};
  for (const lib of libs) {
    const libSrcRelative = path.relative(projectRoot, path.join(rootDir, lib.sourceRoot));
    paths[`@libs/${lib.name}`] = [libSrcRelative];
    paths[`@libs/${lib.name}/*`] = [`${libSrcRelative}/*`];
  }

  // 生成 include 列表
  const include = ['src/**/*'];
  for (const lib of libs) {
    const libSrcRelative = path.relative(projectRoot, path.join(rootDir, lib.sourceRoot));
    include.push(`${libSrcRelative}/**/*`);
  }

  return {
    extends: './tsconfig.app.json',
    compilerOptions: {
      baseUrl: '.',
      rootDir: '.',
      outDir: relativeOutDir,
      paths,
      declaration: false,
      sourceMap: false,
    },
    include,
    exclude: ['node_modules', 'dist', 'test', '**/*spec.ts'],
  };
}
```

### 7.4 PM2 管理器

```typescript
// src/core/pm2-manager.ts
import { spawn, SpawnOptions } from 'child_process';

export class PM2Manager {
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  async start(config: PM2StartConfig): Promise<void> {
    await this.exec(['start', config.script, '--name', config.name, ...this.buildArgs(config)]);
  }

  async stop(name?: string): Promise<void> {
    await this.exec(['stop', name || 'all']);
  }

  async restart(name?: string): Promise<void> {
    await this.exec(['restart', name || 'all']);
  }

  async delete(name?: string): Promise<void> {
    await this.exec(['delete', name || 'all']);
  }

  async list(): Promise<void> {
    await this.exec(['list']);
  }

  async logs(name?: string, lines?: number): Promise<void> {
    const args = ['logs'];
    if (name) args.push(name);
    if (lines) args.push('--lines', String(lines));
    await this.exec(args);
  }

  private buildArgs(config: PM2StartConfig): string[] {
    const args: string[] = [];

    if (config.interpreter) {
      args.push('--interpreter', config.interpreter);
    }
    if (config.nodeArgs) {
      args.push('--node-args', config.nodeArgs);
    }
    if (config.instances) {
      args.push('--instances', String(config.instances));
    }
    if (config.execMode) {
      args.push('--exec-mode', config.execMode);
    }
    if (config.watch) {
      args.push('--watch');
    }
    if (config.maxMemoryRestart) {
      args.push('--max-memory-restart', config.maxMemoryRestart);
    }
    if (config.logFile) {
      args.push('--log', config.logFile);
    }
    if (config.errorFile) {
      args.push('--error', config.errorFile);
    }
    if (config.outFile) {
      args.push('--output', config.outFile);
    }

    return args;
  }

  private exec(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('npx', ['pm2', ...args], {
        cwd: this.cwd,
        stdio: 'inherit',
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`PM2 command failed with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }
}

interface PM2StartConfig {
  name: string;
  script: string;
  interpreter?: string;
  nodeArgs?: string;
  instances?: number;
  execMode?: 'fork' | 'cluster';
  watch?: boolean;
  maxMemoryRestart?: string;
  logFile?: string;
  errorFile?: string;
  outFile?: string;
}
```

---

## 8. 依赖清单

### 生产依赖

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "dotenv": "^16.4.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0"
  }
}
```

### 开发依赖

```json
{
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "esbuild": "^0.24.0",
    "pkg": "^5.8.0"
  }
}
```

### 用户项目需要安装的依赖

```json
{
  "devDependencies": {
    "@swc-node/register": "^1.10.0",
    "tsconfig-paths": "^4.2.0",
    "pm2": "^5.4.0"
  }
}
```

---

## 9. 二进制打包方案

### 方案 A: 使用 pkg

```json
{
  "bin": "bin/yap.js",
  "pkg": {
    "scripts": "dist/**/*.js",
    "targets": ["node20-macos-x64", "node20-macos-arm64", "node20-linux-x64", "node20-win-x64"],
    "outputPath": "binaries"
  }
}
```

### 方案 B: 使用 Node.js SEA (Single Executable Applications)

Node.js 20+ 原生支持，无需第三方工具：

```bash
# 1. 生成 blob
echo '{ "main": "dist/index.js", "output": "sea-prep.blob" }' > sea-config.json
node --experimental-sea-config sea-config.json

# 2. 复制 node 二进制
cp $(which node) yap

# 3. 注入 blob
npx postject yap NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
```

**推荐方案 A (pkg)**，因为更成熟稳定。

---

## 10. 未来迭代规划

### v0.2.0
- 自定义配置文件 `yap.config.ts`（替代 nest-cli.json）
- 代码生成器（接管 nest generate）

### v0.3.0
- Docker 支持
  - 自动生成 Dockerfile
  - 自动生成 docker-compose.yml
- Kubernetes 支持
  - 自动生成 k8s manifests

### v0.4.0
- 插件系统
- 自定义命令支持

---

## 11. 风险与注意事项

1. **@swc-node/register 的 ESM 兼容性**
   - 需要 Node.js >= 20.6
   - 某些边缘情况可能有问题，需要充分测试

2. **tsconfig-paths 运行时解析**
   - 在 ESM 模式下可能需要额外配置
   - 备选方案：使用 `tsc-alias` 在编译时重写路径

3. **PM2 与 watch 模式的交互**
   - PM2 的 watch 功能可能不如专用工具（如 nodemon）灵活
   - 可考虑后续版本提供可选的 watch 实现

4. **Windows 兼容性**
   - 路径分隔符处理
   - spawn 命令的差异

---

## 12. 参考资料

- [@swc-node/register GitHub](https://github.com/swc-project/swc-node)
- [tsconfig-paths GitHub](https://github.com/dividab/tsconfig-paths)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Node.js SEA](https://nodejs.org/api/single-executable-applications.html)
- [pkg](https://github.com/vercel/pkg)
