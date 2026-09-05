import { spawn } from 'node:child_process'
import type { CommandResult, ProcessRunner } from '../compatibility/environment.js'

export class SpawnProcessRunner implements ProcessRunner {
  run(command: string, args: string[]): Promise<CommandResult> {
    return new Promise(resolve => {
      const child = spawn(command, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let settled = false

      child.stdout.on('data', chunk => { stdout += String(chunk) })
      child.stderr.on('data', chunk => { stderr += String(chunk) })
      child.on('error', error => {
        if (settled) return
        settled = true
        resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` })
      })
      child.on('close', code => {
        if (settled) return
        settled = true
        resolve({ code: code ?? 1, stdout, stderr })
      })
    })
  }
}
