import { resolve } from "path"
import { fork } from "child_process"

import { advancedRun, getExitMap } from "."

enum EXIT_STATE {
  "successful",
  "errorcode",
  "abort"
}

jest.mock("child_process")

function runCmd(filename: string, currentExitState: EXIT_STATE) {
  const runner = advancedRun()

  const input = filename
  const fullPath = resolve(input)
  runner.options({
    input
  })

  if (currentExitState === EXIT_STATE.successful) {
    fork.mockReturnValueOnce({
      on: (event, callback) => {
        if (event === "exit") {
          setTimeout(() => {
            callback(0)
          }, 1)
        }
      }
    })
  } else if (currentExitState === EXIT_STATE.errorcode) {
    fork.mockReturnValueOnce({
      on: (event, callback) => {
        if (event === "exit") {
          setTimeout(() => {
            callback(127)
          }, 1)
        }
      }
    })
  } else if (currentExitState === EXIT_STATE.abort) {
    fork.mockReturnValueOnce({
      on: (event, callback) => {
        if (event === "error") {
          setTimeout(() => {
            callback(new Error("error"))
          }, 1)
        }
      }
    })
  }

  runner.generateBundle(
    {
      dir: "/test",
      file: input
    },
    {
      [fullPath]: {
        isEntry: true,
        modules: {
          [fullPath]: true
        }
      }
    },
    true
  )
}

test("states of executable", async () => {
  runCmd("successful.js", EXIT_STATE.successful)
  runCmd("failure.js", EXIT_STATE.errorcode)
  runCmd("abort.js", EXIT_STATE.abort)

  const exitMap = await getExitMap()
  expect(exitMap).toMatchSnapshot()
})
