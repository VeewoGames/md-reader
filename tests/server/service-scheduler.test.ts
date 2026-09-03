import { describe, expect, it } from 'vitest'

import { buildTaskXml } from '../../service-scheduler.mjs'

describe('ServiceHost Task Scheduler contract', () => {
  it('uses current-user, non-overlapping, battery-safe and unbounded runtime settings', () => {
    const xml = buildTaskXml({
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
    expect(xml).toContain('<WorkingDirectory>C:\\Code\\md-reader</WorkingDirectory>')
  })
})
