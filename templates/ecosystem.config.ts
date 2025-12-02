import type { EcosystemConfig } from 'yap-cli';

const config: EcosystemConfig = {
  apps: [], // CLI will auto-fill based on nest-cli.json

  global: {
    env_file_pattern: '.env.{env}',
    log_dir: './logs',
    combine_logs: false,
  },
};

export default config;
