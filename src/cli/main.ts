import type { ProcessRunner } from '../compatibility/environment.js'
import { runCheck } from './commands/check.js'
import { runDoctor } from './commands/doctor.js'
import { runInstall } from './commands/install.js'
import { runUninstall } from './commands/uninstall.js'
import { runVersion } from './commands/version.js'
import { consoleWriter, type OutputWriter } from './output.js'
import { SpawnProcessRunner } from './process.js'

interface ParsedOptions {
  profile: string
  json: boolean
  packageSpec: string
}

export interface MainDependencies {
  runner?: ProcessRunner
  writer?: OutputWriter
}

function printHelp(writer: OutputWriter): void {
  writer.out('DSH Tool Gate')
  writer.out('')
  writer.out('Usage: dsh-tool-gate <command> [options]')
  writer.out('')
  writer.out('Commands:')
  writer.out('  doctor      Diagnose DSH, pnpm, profile, and bundle installation')
  writer.out('  check       Machine-friendly environment compatibility check')
  writer.out('  install     Install Tool Gate through the official DSH plugin command')
  writer.out('  uninstall   Remove Tool Gate from a DSH profile')
  writer.out('  version     Print Tool Gate version')
  writer.out('')
  writer.out('Options:')
  writer.out('  --profile <name>   DSH profile (default: web)')
  writer.out('  --json             JSON output for doctor/check')
  writer.out('  --package <spec>   Package spec for install (default: dsh-tool-gate)')
}

function parseOptions(args: string[]): ParsedOptions {
  const result: ParsedOptions = { profile: 'web', json: false, packageSpec: 'dsh-tool-gate' }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--json') {
      result.json = true
      continue
    }
    if (arg === '--profile' || arg === '--package') {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      if (arg === '--profile') result.profile = value
      else result.packageSpec = value
      index += 1
      continue
    }
    if (arg.startsWith('--profile=')) {
      result.profile = arg.slice('--profile='.length)
      continue
    }
    if (arg.startsWith('--package=')) {
      result.packageSpec = arg.slice('--package='.length)
      continue
    }
    throw new Error(`unknown option ${JSON.stringify(arg)}`)
  }
  return result
}

export async function main(argv: string[], dependencies: MainDependencies = {}): Promise<number> {
  const writer = dependencies.writer ?? consoleWriter
  const runner = dependencies.runner ?? new SpawnProcessRunner()
  const [command, ...args] = argv

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    printHelp(writer)
    return 0
  }
  if (command === 'version' || command === '--version' || command === '-V') return runVersion(writer)

  let options: ParsedOptions
  try {
    options = parseOptions(args)
  } catch (error) {
    writer.error(String(error))
    printHelp(writer)
    return 2
  }

  if (command === 'doctor') return runDoctor({ profile: options.profile, json: options.json }, { runner, writer })
  if (command === 'check') return runCheck({ json: options.json }, { runner, writer })
  if (command === 'install') return runInstall({ profile: options.profile, packageSpec: options.packageSpec }, { runner, writer })
  if (command === 'uninstall') return runUninstall({ profile: options.profile }, { runner, writer })

  writer.error(`unknown command ${JSON.stringify(command)}`)
  printHelp(writer)
  return 2
}
