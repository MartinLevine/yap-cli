import chalk from 'chalk';

export const logger = {
  info: (message: string) => {
    console.log(chalk.blue('ℹ'), message);
  },

  success: (message: string) => {
    console.log(chalk.green('✓'), message);
  },

  warn: (message: string) => {
    console.log(chalk.yellow('⚠'), message);
  },

  error: (message: string) => {
    console.log(chalk.red('✗'), message);
  },

  debug: (message: string) => {
    if (process.env.DEBUG) {
      console.log(chalk.gray('⋯'), message);
    }
  },

  log: (message: string) => {
    console.log(message);
  },

  newline: () => {
    console.log();
  },

  service: (name: string, status: 'starting' | 'running' | 'stopped' | 'error') => {
    const statusColors = {
      starting: chalk.yellow,
      running: chalk.green,
      stopped: chalk.gray,
      error: chalk.red,
    };
    const statusIcons = {
      starting: '◐',
      running: '●',
      stopped: '○',
      error: '✗',
    };
    console.log(
      statusColors[status](statusIcons[status]),
      chalk.bold(name),
      statusColors[status](`[${status}]`)
    );
  },

  table: (data: Record<string, string>[]) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const colWidths = headers.map((h) =>
      Math.max(h.length, ...data.map((row) => String(row[h] || '').length))
    );

    // Header
    console.log(
      headers.map((h, i) => chalk.bold(h.padEnd(colWidths[i]))).join('  ')
    );
    console.log(colWidths.map((w) => '─'.repeat(w)).join('──'));

    // Rows
    data.forEach((row) => {
      console.log(
        headers.map((h, i) => String(row[h] || '').padEnd(colWidths[i])).join('  ')
      );
    });
  },
};
