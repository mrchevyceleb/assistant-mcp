import chalk from 'chalk';
import ora, { Ora } from 'ora';

export const colors = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  dim: chalk.dim,
  bold: chalk.bold,
  cyan: chalk.cyan,
};

export function success(message: string): void {
  console.log(colors.success('✓'), message);
}

export function error(message: string): void {
  console.log(colors.error('✗'), message);
}

export function warning(message: string): void {
  console.log(colors.warning('⚠'), message);
}

export function info(message: string): void {
  console.log(colors.info('ℹ'), message);
}

export function heading(message: string): void {
  console.log();
  console.log(colors.bold(message));
  console.log(colors.dim('─'.repeat(40)));
}

export function keyValue(key: string, value: string): void {
  console.log(`  ${colors.dim(key + ':')} ${value}`);
}

export function table(headers: string[], rows: string[][]): void {
  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || '').length))
  );

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  console.log(colors.bold(headerLine));
  console.log(colors.dim('─'.repeat(headerLine.length)));

  // Print rows
  for (const row of rows) {
    const line = row.map((cell, i) => (cell || '').padEnd(widths[i])).join('  ');
    console.log(line);
  }
}

export function spinner(message: string): Ora {
  return ora({
    text: message,
    color: 'cyan',
  }).start();
}

export function maskKey(key: string): string {
  if (key.length <= 8) {
    return '****' + key.slice(-3);
  }
  return key.slice(0, 4) + '****' + key.slice(-3);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}
