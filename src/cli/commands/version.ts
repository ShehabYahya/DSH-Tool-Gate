import { PACKAGE_VERSION } from '../meta.js'
import type { OutputWriter } from '../output.js'

export function runVersion(writer: OutputWriter): number {
  writer.out(PACKAGE_VERSION)
  return 0
}
