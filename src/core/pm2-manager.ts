import { spawn, SpawnOptions, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { AppConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface PM2StartConfig {
  name: string;
  script: string;
  cwd: string;
  interpreter?: string;
  nodeArgs?: string;
  instances?: number;
  execMode?: 'fork' | 'cluster';
  watch?: boolean;
  watchDelay?: number;
  ignoreWatch?: string[];
  maxMemoryRestart?: string;
  env?: Record<string, string | number | boolean>;
  logFile?: string;
  errorFile?: string;
  outFile?: string;
  logDateFormat?: string;
  mergeLogs?: boolean;
  autorestart?: boolean;
  maxRestarts?: number;
  restartDelay?: number;
}

export class PM2Manager {
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /**
   * 启动服务（使用临时 ecosystem 配置文件以确保配置正确）
   */
  async start(config: PM2StartConfig): Promise<void> {
    // 构建 PM2 ecosystem 配置
    const pm2Config = {
      name: config.name,
      script: config.script,
      cwd: config.cwd,
      interpreter: config.interpreter || 'node',
      node_args: config.nodeArgs,
      instances: config.instances || 1,
      exec_mode: config.execMode || 'fork',
      watch: config.watch || false,
      watch_delay: config.watchDelay || 1000,
      ignore_watch: config.ignoreWatch || ['node_modules', '.git', '*.log'],
      max_memory_restart: config.maxMemoryRestart,
      env: config.env,
      error_file: config.errorFile,
      out_file: config.outFile,
      log_file: config.logFile,
      log_date_format: config.logDateFormat,
      merge_logs: config.mergeLogs,
      autorestart: config.autorestart !== false,
      max_restarts: config.maxRestarts,
      restart_delay: config.restartDelay,
    };

    // 创建临时 ecosystem 配置文件
    const tempDir = os.tmpdir();
    const ecosystemPath = path.join(tempDir, `yap-pm2-${config.name}-${Date.now()}.config.cjs`);
    const ecosystemContent = `module.exports = { apps: [${JSON.stringify(pm2Config)}] };`;

    try {
      fs.writeFileSync(ecosystemPath, ecosystemContent);

      // 将配置的 env 传递给子进程
      const processEnv: NodeJS.ProcessEnv = config.env
        ? { ...process.env, ...this.envToStrings(config.env) }
        : process.env;

      await this.exec(['start', ecosystemPath], processEnv);
    } finally {
      // 清理临时文件
      try {
        fs.unlinkSync(ecosystemPath);
      } catch {
        // 忽略清理失败
      }
    }
  }

  /**
   * 将环境变量转换为字符串格式
   */
  private envToStrings(env: Record<string, string | number | boolean>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      result[key] = String(value);
    }
    return result;
  }

  /**
   * 停止服务
   */
  async stop(name?: string): Promise<void> {
    await this.exec(['stop', name || 'all']);
  }

  /**
   * 重启服务
   */
  async restart(name?: string): Promise<void> {
    await this.exec(['restart', name || 'all']);
  }

  /**
   * 删除服务
   */
  async delete(name?: string): Promise<void> {
    await this.exec(['delete', name || 'all']);
  }

  /**
   * 静默删除服务（不输出到控制台，忽略错误）
   */
  async deleteSilent(name: string): Promise<void> {
    await this.execSilent(['delete', name]);
  }

  /**
   * 列出所有服务
   */
  async list(): Promise<void> {
    await this.exec(['list']);
  }

  /**
   * 查看日志，返回子进程以便外部控制
   */
  logsWithProcess(name?: string, lines?: number, follow?: boolean): ChildProcess {
    const args = ['logs'];
    if (name) args.push(name);
    if (lines) args.push('--lines', String(lines));
    if (follow === false) args.push('--nostream');

    return spawn('npx', ['pm2', ...args], {
      cwd: this.cwd,
      stdio: 'inherit',
      shell: true,
    });
  }

  /**
   * 查看日志
   */
  async logs(name?: string, lines?: number, follow?: boolean): Promise<void> {
    const args = ['logs'];
    if (name) args.push(name);
    if (lines) args.push('--lines', String(lines));
    if (follow === false) args.push('--nostream');
    await this.exec(args);
  }

  /**
   * 刷新日志
   */
  async flush(name?: string): Promise<void> {
    await this.exec(['flush', name || 'all']);
  }

  /**
   * 获取服务状态
   */
  async status(): Promise<string> {
    return this.execCapture(['jlist']);
  }

  /**
   * 保存当前进程列表
   */
  async save(): Promise<void> {
    await this.exec(['save']);
  }

  /**
   * 使用 ecosystem 文件启动
   */
  async startWithEcosystem(ecosystemPath: string, env?: string): Promise<void> {
    const args = ['start', ecosystemPath];
    if (env) {
      args.push('--env', env);
    }
    await this.exec(args);
  }

  private exec(args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('npx', ['pm2', ...args], {
        cwd: this.cwd,
        stdio: 'inherit',
        shell: true,
        env: env || process.env,
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`PM2 command failed with code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  private execCapture(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';

      const child = spawn('npx', ['pm2', ...args], {
        cwd: this.cwd,
        stdio: ['inherit', 'pipe', 'inherit'],
        shell: true,
      });

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`PM2 command failed with code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 静默执行命令（不输出到控制台，忽略错误）
   */
  private execSilent(args: string[]): Promise<void> {
    return new Promise((resolve) => {
      const child = spawn('npx', ['pm2', ...args], {
        cwd: this.cwd,
        stdio: 'ignore',
        shell: true,
      });

      child.on('close', () => {
        resolve();
      });

      child.on('error', () => {
        resolve();
      });
    });
  }
}

/**
 * 将 AppConfig 转换为 PM2StartConfig
 */
export function appConfigToPM2Config(
  appConfig: AppConfig,
  script: string,
  cwd: string,
  nodeArgs?: string
): PM2StartConfig {
  return {
    name: appConfig.name,
    script,
    cwd,
    nodeArgs,
    instances: appConfig.instances,
    execMode: appConfig.exec_mode,
    watch: appConfig.watch,
    ignoreWatch: appConfig.ignore_watch,
    maxMemoryRestart: appConfig.max_memory_restart,
    env: appConfig.env as Record<string, string | number | boolean>,
    errorFile: appConfig.error_file,
    outFile: appConfig.out_file,
    logDateFormat: appConfig.log_date_format,
    mergeLogs: appConfig.merge_logs,
    autorestart: appConfig.autorestart,
    maxRestarts: appConfig.max_restarts,
    restartDelay: appConfig.restart_delay,
  };
}
