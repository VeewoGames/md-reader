import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { buildTaskXml } from '../../service-scheduler.mjs'

const execFileAsync = promisify(execFile)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('ServiceHost Task Scheduler contract', () => {
  it('uses current-user, non-overlapping, battery-safe and unbounded runtime settings', () => {
    const xml = buildTaskXml({
      scriptHostPath: 'C:\\Windows\\System32\\wscript.exe',
      launcherPath: 'C:\\Code\\md-reader\\server\\service-host-launcher.vbs',
      nodePath: 'C:\\Program Files\\nodejs\\node.exe',
      hostPath: 'C:\\Code\\md-reader\\server\\service-host.mjs',
      runtimeHome: 'C:\\Users\\Lans\\AppData\\Roaming\\md-reader',
      workingDirectory: 'C:\\Code\\md-reader',
      userId: 'DESKTOP\\Lans',
    })

    expect(xml).toContain('<LogonType>InteractiveToken</LogonType>')
    expect(xml).toContain('<TimeTrigger><Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition>')
    expect(xml).toContain('<RunLevel>LeastPrivilege</RunLevel>')
    expect(xml).toContain('<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>')
    expect(xml).toContain('<StartWhenAvailable>true</StartWhenAvailable>')
    expect(xml).toContain('<WakeToRun>false</WakeToRun>')
    expect(xml).toContain('<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>')
    expect(xml).toContain('<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>')
    expect(xml).toContain('<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>')
    expect(xml).toContain('<RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>')
    expect(xml).toContain('<Command>C:\\Windows\\System32\\wscript.exe</Command>')
    expect(xml).toContain('//B //NoLogo &quot;C:\\Code\\md-reader\\server\\service-host-launcher.vbs&quot; &quot;C:\\Program Files\\nodejs\\node.exe&quot;')
    expect(xml).not.toContain('<Command>C:\\Program Files\\nodejs\\node.exe</Command>')
    expect(xml).toContain('<WorkingDirectory>C:\\Code\\md-reader</WorkingDirectory>')
  })

  it.runIf(process.platform === 'win32')('forwards the hidden Node process exit code', async () => {
    const launcherPath = path.join(projectRoot, 'server', 'service-host-launcher.vbs')
    const scriptHostPath = path.join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'wscript.exe')

    await expect(
      execFileAsync(
        scriptHostPath,
        ['//B', '//NoLogo', launcherPath, process.execPath, '-e', 'process.exit(23)'],
        { windowsHide: true },
      ),
    ).rejects.toMatchObject({ code: 23 })
  })
})
