import { Command } from 'commander';
import {
  devCommand,
  buildCommand,
  startCommand,
  stopCommand,
  restartCommand,
  logsCommand,
  listCommand,
  initCommand,
} from './commands/index.js';

const program = new Command();

program
  .name('yap')
  .description('CLI tool for managing NestJS monorepo projects')
  .version('0.1.0');

// dev command
program
  .command('dev [services...]')
  .description('Start services in development mode')
  .option('-a, --all', 'Start all services')
  .option('-e, --env <environment>', 'Environment name', 'development')
  .option('--no-watch', 'Disable file watching')
  .option('-d, --detach', 'Run in background (detached mode)')
  .action(async (services: string[], options) => {
    await devCommand(services, {
      all: options.all,
      env: options.env,
      watch: options.watch,
      detach: options.detach,
    });
  });

// build command
program
  .command('build [services...]')
  .description('Build services for production')
  .option('-o, --out <directory>', 'Output directory', './dist')
  .option('--no-clean', 'Do not clean output directory before build')
  .action(async (services: string[], options) => {
    await buildCommand(services, {
      out: options.out,
      clean: options.clean,
    });
  });

// start command
program
  .command('start [services...]')
  .description('Start services in production mode')
  .option('-a, --all', 'Start all services')
  .option('-e, --env <environment>', 'Environment name', 'production')
  .action(async (services: string[], options) => {
    await startCommand(services, {
      all: options.all,
      env: options.env,
    });
  });

// stop command
program
  .command('stop [services...]')
  .description('Stop services')
  .option('-a, --all', 'Stop all services')
  .action(async (services: string[], options) => {
    await stopCommand(services, {
      all: options.all,
    });
  });

// restart command
program
  .command('restart [services...]')
  .description('Restart services')
  .option('-a, --all', 'Restart all services')
  .action(async (services: string[], options) => {
    await restartCommand(services, {
      all: options.all,
    });
  });

// logs command
program
  .command('logs [service]')
  .description('View service logs')
  .option('-n, --lines <number>', 'Number of lines to show', '100')
  .option('-f, --follow', 'Follow log output', true)
  .option('--flush', 'Clear/flush logs instead of viewing')
  .action(async (service: string | undefined, options) => {
    await logsCommand(service, {
      lines: parseInt(options.lines, 10),
      follow: options.follow,
      flush: options.flush,
    });
  });

// list command
program
  .command('list')
  .alias('ls')
  .description('List all running services')
  .action(async () => {
    await listCommand();
  });

// init command
program
  .command('init')
  .description('Initialize Yap configuration files')
  .action(async () => {
    await initCommand();
  });

export { program };
