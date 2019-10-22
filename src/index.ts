/*
 * Based upon https://github.com/rollup/rollup-plugin-run
 *
 * LICENSE:
 * Copyright (c) 2018 Rich Harris
 *
 * Permission is hereby granted by the authors of this software, to any person, to use the software for any purpose, free of charge, including the rights to run, read, copy, change, distribute and sell it, and including usage rights to any patents the authors may hold on it, subject to the following conditions:
 *
 * This license, or a link to its text, must be included with all copies of the software and any derivative works.
 *
 * Any modification to the software submitted to the authors may be incorporated into the software under the terms of this license.
 *
 * The software is provided "as is", without warranty of any kind, including but not limited to the warranties of title, fitness, merchantability and non-infringement. The authors have no obligation to provide support or updates for the software, and may not be held liable for any damages, claims or other liability arising from its use.
 */

import { fork, ForkOptions } from "child_process"
import { relative, resolve, dirname, join } from "path"

export interface ExitMapEntry {
  command: string
  exitCode: number
  error: Error | null
}
export type ExitMap = ExitMapEntry[]
const exitMapStore: { [s: string]: Promise<number> } = {}

/**
 * Returns map of exit codes of executed scripts
 *
 * @param [basePath] {string} Base path of project
 */
export async function getExitMap(basePath = ""): Promise<ExitMap> {
  const exitMapEntries = await Promise.all(
    Object.entries(exitMapStore).reduce((prev: any[], current) => {
      const [key, value] = current

      prev.push(
        value
          .then((result) => {
            return [key, result, null]
          })
          .catch((error) => {
            return [key, Infinity, error]
          })
      )

      return prev
    }, [])
  )

  return exitMapEntries.reduce((prev: ExitMap, current) => {
    const [key, value, error] = current

    prev.push({
      command: relative(basePath, key),
      exitCode: value,
      error
    })

    return prev
  }, [])
}

export interface RollupOptions {
  args?: any[]
  options?: RollupOptions
}

export function advancedRun(options: RollupOptions = {}) {
  let input
  let proc

  const args = options.args || []
  const forkOptions = options.options || options
  delete forkOptions.args

  return {
    name: "advanced-run",

    options(opts) {
      let inputs = opts.input

      if (typeof inputs === "string") {
        inputs = [inputs]
      }

      if (typeof inputs === "object") {
        inputs = Object.values(inputs)
      }

      if (inputs.length > 1) {
        throw new Error(`rollup-plugin-advanced-run only works with a single entry point`)
      }

      input = resolve(inputs[0])
    },

    generateBundle(outputOptions, bundle, isWrite) {
      if (!isWrite) {
        this.error(
          `rollup-plugin-advanced-run currently only works with bundles that are written to disk`
        )
      }

      const dirName = outputOptions.dir || dirname(outputOptions.file)

      let dest

      for (const fileName in bundle) {
        const chunk = bundle[fileName]

        if (!("isEntry" in chunk)) {
          this.error(`rollup-plugin-advanced-run requires Rollup 0.65 or higher`)
        }

        if (!chunk.isEntry) continue

        if (chunk.modules[input]) {
          dest = join(dirName, fileName)
          break
        }
      }

      if (dest) {
        if (proc) proc.kill()
        proc = fork(dest, args, forkOptions as ForkOptions)

        exitMapStore[outputOptions.file] = new Promise((resolve, reject) => {
          proc.on("exit", (code) => {
            resolve(code)
          })

          proc.on("error", (error: Error) => {
            reject(error)
          })
        })
      } else {
        this.error(`rollup-plugin-advanced-run could not find output chunk`)
      }
    }
  }
}
