import { describe, expect, it } from 'vitest';
import {
  collectProcessTreePids,
  partitionExpectedPlaywrightElectronListeners,
  parseLsofListeners,
  parsePsProcessTable,
  parseWindowsListeners,
  parseWindowsProcesses,
} from '../../e2e/features/remote/ki-buddy/processTreeNetworkState';

describe('packaged process-tree network evidence', () => {
  it('parses Unix process rows and keeps commands with spaces', () => {
    expect(parsePsProcessTable('  10   1 Electron Helper\n  11  10 aioncore\ninvalid\n')).toEqual([
      { pid: 10, ppid: 1, command: 'Electron Helper' },
      { pid: 11, ppid: 10, command: 'aioncore' },
    ]);
  });

  it('parses lsof field output and ignores malformed endpoints', () => {
    expect(parseLsofListeners('p10\ncElectron\nn127.0.0.1:43100\nninvalid\np11\ncaioncore\nn*:43101\n')).toEqual([
      { pid: 10, command: 'Electron', address: '127.0.0.1:43100', port: 43100, protocol: 'tcp' },
      { pid: 11, command: 'aioncore', address: '*:43101', port: 43101, protocol: 'tcp' },
    ]);
  });

  it('finds descendants regardless of process-table order', () => {
    const processes = [
      { pid: 13, ppid: 12, command: 'grandchild' },
      { pid: 12, ppid: 10, command: 'child' },
      { pid: 99, ppid: 1, command: 'unrelated' },
    ];
    expect([...collectProcessTreePids(processes, 10)].toSorted((left, right) => left - right)).toEqual([10, 12, 13]);
  });

  it('normalizes single-object Windows snapshots and rejects incomplete records', () => {
    const processes = parseWindowsProcesses(
      JSON.stringify({
        ProcessId: 20,
        ParentProcessId: 10,
        Name: 'aioncore.exe',
        CommandLine: 'aioncore.exe --port 43200',
      })
    );
    expect(processes).toEqual([{ pid: 20, ppid: 10, command: 'aioncore.exe --port 43200' }]);
    expect(
      parseWindowsListeners(
        JSON.stringify([
          { OwningProcess: 20, LocalAddress: '127.0.0.1', LocalPort: 43200 },
          { OwningProcess: 'bad', LocalAddress: '127.0.0.1', LocalPort: 1 },
        ]),
        processes
      )
    ).toEqual([{ pid: 20, command: 'aioncore.exe --port 43200', address: '127.0.0.1', port: 43200, protocol: 'tcp' }]);
  });

  it('separates the two listeners created by Playwright Electron launch flags', () => {
    const backendListener = {
      pid: 11,
      command: 'aioncore --port 43100',
      address: '127.0.0.1:43100',
      port: 43100,
      protocol: 'tcp' as const,
    };
    const inspectListener = {
      pid: 10,
      command: 'Ki-Buddy --inspect=0 --remote-debugging-port=0',
      address: '127.0.0.1:43101',
      port: 43101,
      protocol: 'tcp' as const,
    };
    const devtoolsListener = { ...inspectListener, address: '127.0.0.1:43102', port: 43102 };
    const partition = partitionExpectedPlaywrightElectronListeners(
      {
        rootPid: 10,
        processes: [
          { pid: 10, ppid: 1, command: inspectListener.command },
          { pid: 11, ppid: 10, command: backendListener.command },
        ],
        listeners: [backendListener, inspectListener, devtoolsListener],
      },
      43100
    );

    expect(partition.playwrightHarnessListeners).toEqual([inspectListener, devtoolsListener]);
    expect(partition.applicationListeners).toEqual([backendListener]);
  });

  it('finds Playwright listeners on the Electron child of a Windows command wrapper', () => {
    const electronCommand = '"C:\\Ki-Buddy.exe" "--inspect=0" "--remote-debugging-port=0"';
    const inspectListener = {
      pid: 12,
      command: electronCommand,
      address: '127.0.0.1',
      port: 43101,
      protocol: 'tcp' as const,
    };
    const devtoolsListener = { ...inspectListener, port: 43102 };
    const partition = partitionExpectedPlaywrightElectronListeners(
      {
        rootPid: 10,
        processes: [
          { pid: 10, ppid: 1, command: `cmd.exe /c ${electronCommand}` },
          { pid: 12, ppid: 10, command: electronCommand },
        ],
        listeners: [inspectListener, devtoolsListener],
      },
      43100
    );

    expect(partition.playwrightHarnessListeners).toEqual([inspectListener, devtoolsListener]);
    expect(partition.applicationListeners).toEqual([]);
  });

  it.each([
    ['missing launch flags', 'Ki-Buddy', [43101, 43102]],
    ['an unexpected third listener', 'Ki-Buddy --inspect=0 --remote-debugging-port=0', [43101, 43102, 43103]],
  ])('does not classify harness listeners when %s', (_scenario, command, ports) => {
    const listeners = ports.map((port) => ({
      pid: 10,
      command,
      address: `127.0.0.1:${port}`,
      port,
      protocol: 'tcp' as const,
    }));
    const partition = partitionExpectedPlaywrightElectronListeners(
      { rootPid: 10, processes: [{ pid: 10, ppid: 1, command }], listeners },
      43100
    );

    expect(partition.playwrightHarnessListeners).toEqual([]);
    expect(partition.applicationListeners).toEqual(listeners);
  });
});
