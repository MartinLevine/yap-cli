import { PM2Manager } from '../core/pm2-manager.js';
import { resolveProjectRoot } from '../utils/paths.js';
import { logger } from '../utils/logger.js';
import chalk from 'chalk';

interface PM2Process {
  pm_id: number;
  name: string;
  pm2_env: {
    status: string;
    exec_mode: string;
    pm_uptime?: number;
    restart_time: number;
    watch?: boolean;
  };
  monit: {
    cpu: number;
    memory: number;
  };
}

function formatUptime(uptime?: number): string {
  if (!uptime) return '-';
  const seconds = Math.floor((Date.now() - uptime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatMemory(bytes: number): string {
  if (bytes === 0) return '0b';
  const units = ['b', 'kb', 'mb', 'gb'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)}${units[i]}`;
}

function formatStatus(status: string): string {
  switch (status) {
    case 'online':
      return chalk.green(status);
    case 'stopped':
      return chalk.red(status);
    case 'errored':
      return chalk.red(status);
    case 'launching':
      return chalk.yellow(status);
    default:
      return status;
  }
}

export async function listCommand(): Promise<void> {
  try {
    const root = resolveProjectRoot();
    const pm2 = new PM2Manager(root);

    const output = await pm2.status();
    let processes: PM2Process[] = [];

    try {
      processes = JSON.parse(output);
    } catch {
      // 如果解析失败，回退到默认的 list 命令
      await pm2.list();
      return;
    }

    if (processes.length === 0) {
      logger.info('No services running');
      return;
    }

    // 自定义表格输出
    const headers = ['id', 'name', 'mode', 'status', 'cpu', 'memory', 'uptime', 'restarts', 'watch'];
    const widths = [4, 20, 8, 10, 6, 10, 8, 10, 8];

    // 打印表头
    const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(' ');
    console.log(chalk.bold(headerLine));
    console.log('-'.repeat(headerLine.length));

    // 打印每行数据
    for (const proc of processes) {
      const statusText = formatStatus(proc.pm2_env.status);
      const row = [
        String(proc.pm_id).padEnd(widths[0]),
        proc.name.slice(0, widths[1] - 1).padEnd(widths[1]),
        proc.pm2_env.exec_mode.padEnd(widths[2]),
        proc.pm2_env.status.padEnd(widths[3]),
        `${proc.monit.cpu}%`.padEnd(widths[4]),
        formatMemory(proc.monit.memory).padEnd(widths[5]),
        formatUptime(proc.pm2_env.pm_uptime).padEnd(widths[6]),
        String(proc.pm2_env.restart_time).padEnd(widths[7]),
        (proc.pm2_env.watch ? 'yes' : 'no').padEnd(widths[8]),
      ];
      // 替换 status 文本为带颜色的版本
      const line = row.join(' ').replace(proc.pm2_env.status, statusText);
      console.log(line);
    }

  } catch (error) {
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
