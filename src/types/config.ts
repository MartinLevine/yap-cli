// Yap CLI 配置类型定义

export interface AppConfig {
  name: string;
  instances?: number;
  exec_mode?: 'fork' | 'cluster';
  max_memory_restart?: string;
  env?: Record<string, string | number | boolean>;
  env_production?: Record<string, string | number | boolean>;
  env_staging?: Record<string, string | number | boolean>;
  log_date_format?: string;
  error_file?: string;
  out_file?: string;
  merge_logs?: boolean;
  autorestart?: boolean;
  max_restarts?: number;
  restart_delay?: number;
  watch?: boolean;
  ignore_watch?: string[];
}

export interface GlobalConfig {
  env_file_pattern?: string;
  log_dir?: string;
  combine_logs?: boolean;
}

export interface EcosystemConfig {
  apps: AppConfig[];
  global?: GlobalConfig;
}

export interface ResolvedService {
  name: string;
  type: 'application' | 'library';
  root: string;
  sourceRoot: string;
  entryFile: string;
  tsConfigPath?: string;
}

export interface DevOptions {
  all?: boolean;
  env?: string;
  watch?: boolean;
  detach?: boolean;  // 后台运行模式
}

export interface BuildOptions {
  out?: string;
  clean?: boolean;
}

export interface StartOptions {
  all?: boolean;
  env?: string;
}

export interface StopOptions {
  all?: boolean;
}

export interface RestartOptions {
  all?: boolean;
}

export interface LogsOptions {
  lines?: number;
  follow?: boolean;
  flush?: boolean;
}
