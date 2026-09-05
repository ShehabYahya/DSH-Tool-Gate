export interface OutputWriter {
  out(line: string): void
  error(line: string): void
}

export const consoleWriter: OutputWriter = {
  out: line => console.log(line),
  error: line => console.error(line),
}

export function renderCheck(ok: boolean, message: string): string {
  return `${ok ? '✓' : '✗'} ${message}`
}
