# Yap CLI

NestJS Monorepo 项目管理工具，提供开发、构建和 PM2 进程管理功能。

详细设计文档参考：[feature-monorepo-cli.md](./docs/feature-monorepo-cli.md)

## 安装

```bash
# 在 tools/yap 目录下
npm install
npm run build
npm link
```

## 命令

### `yap dev [services...]`

开发模式启动服务，使用 `@swc-node/register` 直接运行 TypeScript，支持文件监听和热重载。

```bash
# 启动指定服务
yap dev api-gateway

# 启动多个服务
yap dev api-gateway user-service

# 启动所有服务
yap dev --all

# 指定环境
yap dev api-gateway --env development

# 禁用 watch 模式
yap dev api-gateway --no-watch
```

**选项：**
- `-a, --all` - 启动所有应用服务
- `-e, --env <env>` - 环境名称，默认 `development`
- `--no-watch` - 禁用文件监听

### `yap build [services...]`

编译服务，将 TypeScript 编译为 JavaScript，自动处理 path alias 重写。

```bash
# 构建指定服务
yap build api-gateway

# 构建多个服务
yap build api-gateway user-service

# 构建所有服务
yap build --all

# 清理后重新构建
yap build --all --clean
```

**选项：**
- `-a, --all` - 构建所有应用服务
- `-c, --clean` - 构建前清理 dist 目录

**输出结构：**
```
dist/
└── <service-name>/
    ├── apps/<service-name>/src/
    │   └── main.js
    └── libs/<lib-name>/src/
        └── index.js
```

### `yap start [services...]`

使用 PM2 启动已编译的服务（生产模式）。

```bash
# 启动指定服务
yap start api-gateway

# 启动所有服务
yap start --all

# 指定环境
yap start --all --env production
```

**选项：**
- `-a, --all` - 启动所有应用服务
- `-e, --env <env>` - 环境名称，默认 `production`

### `yap stop [services...]`

停止 PM2 管理的服务。

```bash
# 停止指定服务
yap stop api-gateway

# 停止所有服务
yap stop --all
```

**选项：**
- `-a, --all` - 停止所有服务

### `yap restart [services...]`

重启 PM2 管理的服务。

```bash
# 重启指定服务
yap restart api-gateway

# 重启所有服务
yap restart --all
```

**选项：**
- `-a, --all` - 重启所有服务

### `yap logs [service]`

查看服务日志。

```bash
# 查看所有服务日志
yap logs

# 查看指定服务日志
yap logs api-gateway

# 指定显示行数
yap logs api-gateway --lines 100

# 不跟踪新日志（只显示当前内容）
yap logs --no-follow
```

**选项：**
- `-n, --lines <number>` - 显示的日志行数
- `--no-follow` - 不跟踪新日志

### `yap list`

列出所有 PM2 管理的服务及其状态。

```bash
yap list
```

### `yap init`

初始化项目配置，生成 `ecosystem.config.ts` 和环境变量文件。

```bash
yap init
```

**生成的文件：**
- `ecosystem.config.ts` - PM2 配置文件
- `.env` - 基础环境变量
- `.env.development` - 开发环境变量
- `.env.production` - 生产环境变量

## 项目结构要求

yap 需要标准的 NestJS Monorepo 项目结构：

```
project-root/
├── nest-cli.json          # NestJS 配置（必需）
├── tsconfig.json          # TypeScript 配置（必需）
├── package.json
├── apps/
│   ├── api-gateway/
│   │   └── src/
│   │       └── main.ts
│   └── user-service/
│       └── src/
│           └── main.ts
└── libs/
    └── shared/
        └── src/
            └── index.ts
```

### nest-cli.json 示例

```json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "apps/api-gateway/src",
  "monorepo": true,
  "root": "apps/api-gateway",
  "compilerOptions": {
    "webpack": false,
    "tsConfigPath": "apps/api-gateway/tsconfig.app.json"
  },
  "projects": {
    "api-gateway": {
      "type": "application",
      "root": "apps/api-gateway",
      "entryFile": "main",
      "sourceRoot": "apps/api-gateway/src"
    },
    "shared": {
      "type": "library",
      "root": "libs/shared",
      "entryFile": "index",
      "sourceRoot": "libs/shared/src"
    }
  }
}
```

### tsconfig.json Path Alias

```json
{
  "compilerOptions": {
    "paths": {
      "@libs/shared": ["libs/shared/src"],
      "@libs/shared/*": ["libs/shared/src/*"]
    }
  }
}
```

## 环境变量

yap 支持按环境加载不同的 `.env` 文件：

- `.env` - 基础配置（始终加载）
- `.env.development` - 开发环境（`--env development`）
- `.env.production` - 生产环境（`--env production`）
- `.env.<custom>` - 自定义环境（`--env <custom>`）

加载顺序：先加载 `.env`，再加载环境特定的文件，后者会覆盖前者。

## 日志

服务日志保存在项目根目录的 `logs/` 文件夹：

```
logs/
├── api-gateway-out.log     # 标准输出
├── api-gateway-error.log   # 错误输出
├── user-service-out.log
└── user-service-error.log
```

## 依赖要求

yap 已内置所有必要的开发依赖（`@swc-node/register`、`@swc/core`、`tsconfig-paths`），用户无需额外安装。

## 常见问题

### Q: 构建后 path alias 无法解析？

yap 会自动在构建后重写 path alias（如 `@libs/xxx`）为相对路径，无需额外配置。

### Q: dev 模式报错找不到模块？

确保 yap 的依赖已正确安装。在 `tools/yap` 目录下运行：

```bash
npm install
```

### Q: 如何查看 PM2 进程详情？

```bash
npx pm2 show <service-name>
npx pm2 monit
```

### Q: 如何清理所有 PM2 进程？

```bash
npx pm2 delete all
```
