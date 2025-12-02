import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * 加载环境变量文件
 * 加载顺序：.env -> .env.<environment> -> .env.local
 */
export function loadEnvFiles(
  root: string,
  environment: string = 'development'
): Record<string, string> {
  const envFiles = [
    '.env',
    `.env.${environment}`,
    '.env.local',
  ];

  let merged: Record<string, string> = {};

  for (const file of envFiles) {
    const filePath = path.join(root, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = dotenv.parse(content);
      merged = { ...merged, ...parsed };
    }
  }

  return merged;
}

/**
 * 将环境变量应用到 process.env
 */
export function applyEnvToProcess(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * 生成 .env.example 模板内容
 */
export function generateEnvExampleContent(): string {
  return `# Application
NODE_ENV=development
PORT=3000

# Database
# DATABASE_URL=postgres://user:password@localhost:5432/dbname

# Redis
# REDIS_URL=redis://localhost:6379

# JWT
# JWT_SECRET=your-secret-key
# JWT_EXPIRES_IN=7d

# Logging
LOG_LEVEL=debug
`;
}

/**
 * 检查 .env 文件是否存在
 */
export function envFileExists(root: string, environment?: string): boolean {
  if (environment) {
    return fs.existsSync(path.join(root, `.env.${environment}`));
  }
  return fs.existsSync(path.join(root, '.env'));
}

/**
 * 获取环境变量文件路径
 */
export function getEnvFilePath(root: string, environment: string): string {
  return path.join(root, `.env.${environment}`);
}
