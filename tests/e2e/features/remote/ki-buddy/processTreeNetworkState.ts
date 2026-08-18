import { execFileSync } from 'node:child_process';

export type ProcessTreeRecord = Readonly<{
  command: string;
  pid: number;
  ppid: number;
}>;

export type ProcessTreeListener = Readonly<{
  address: string;
  command: string;
  pid: number;
  port: number;
  protocol: 'tcp';
}>;

export type ProcessTreeNetworkState = Readonly<{
  listeners: readonly ProcessTreeListener[];
  processes: readonly ProcessTreeRecord[];
  rootPid: number;
}>;

type WindowsProcessRecord = Readonly<{
  CommandLine?: unknown;
  Name?: unknown;
  ParentProcessId?: unknown;
  ProcessId?: unknown;
}>;

type WindowsListenerRecord = Readonly<{
  LocalAddress?: unknown;
  LocalPort?: unknown;
  OwningProcess?: unknown;
}>;

const normalizeJsonArray = (value: unknown): unknown[] => {
  if (value === null || value === undefined || value === '') return [];
  return Array.isArray(value) ? value : [value];
};

export function parsePsProcessTable(output: string): ProcessTreeRecord[] {
  return output.split(/\r?\n/).flatMap((line): ProcessTreeRecord[] => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/);
    if (!match) return [];
    return [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }];
  });
}

export function parseLsofListeners(output: string): ProcessTreeListener[] {
  const listeners: ProcessTreeListener[] = [];
  let pid: number | undefined;
  let command = '';

  for (const line of output.split(/\r?\n/)) {
    const field = line[0];
    const value = line.slice(1);
    if (field === 'p') {
      pid = /^\d+$/.test(value) ? Number(value) : undefined;
      command = '';
      continue;
    }
    if (field === 'c') {
      command = value;
      continue;
    }
    if (field !== 'n' || pid === undefined) continue;

    const portMatch = value.match(/:(\d+)(?:\s+\(LISTEN\))?$/);
    if (!portMatch) continue;
    listeners.push({
      pid,
      command,
      address: value,
      port: Number(portMatch[1]),
      protocol: 'tcp',
    });
  }

  return listeners;
}

export function parseWindowsProcesses(output: string): ProcessTreeRecord[] {
  if (!output.trim()) return [];
  const records = normalizeJsonArray(JSON.parse(output) as unknown) as WindowsProcessRecord[];
  return records.flatMap((record): ProcessTreeRecord[] => {
    if (
      typeof record.ProcessId !== 'number' ||
      typeof record.ParentProcessId !== 'number' ||
      typeof record.Name !== 'string'
    ) {
      return [];
    }
    return [
      {
        pid: record.ProcessId,
        ppid: record.ParentProcessId,
        command: typeof record.CommandLine === 'string' ? record.CommandLine : record.Name,
      },
    ];
  });
}

export function parseWindowsListeners(output: string, processes: readonly ProcessTreeRecord[]): ProcessTreeListener[] {
  if (!output.trim()) return [];
  const commands = new Map(processes.map(({ command, pid }) => [pid, command]));
  const records = normalizeJsonArray(JSON.parse(output) as unknown) as WindowsListenerRecord[];
  return records.flatMap((record): ProcessTreeListener[] => {
    if (
      typeof record.OwningProcess !== 'number' ||
      typeof record.LocalAddress !== 'string' ||
      typeof record.LocalPort !== 'number'
    ) {
      return [];
    }
    return [
      {
        pid: record.OwningProcess,
        command: commands.get(record.OwningProcess) ?? '',
        address: record.LocalAddress,
        port: record.LocalPort,
        protocol: 'tcp',
      },
    ];
  });
}

export function collectProcessTreePids(processes: readonly ProcessTreeRecord[], rootPid: number): Set<number> {
  const treePids = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const processRecord of processes) {
      if (!treePids.has(processRecord.ppid) || treePids.has(processRecord.pid)) continue;
      treePids.add(processRecord.pid);
      changed = true;
    }
  }
  return treePids;
}

export function partitionExpectedPlaywrightElectronListeners(
  state: ProcessTreeNetworkState,
  backendPort: number
): Readonly<{
  applicationListeners: readonly ProcessTreeListener[];
  playwrightHarnessListeners: readonly ProcessTreeListener[];
}> {
  const hasPlaywrightDebugFlags = (command: string): boolean =>
    /(?:^|[\s"])--inspect=0(?=[\s"]|$)/.test(command) &&
    /(?:^|[\s"])--remote-debugging-port=0(?=[\s"]|$)/.test(command);
  const harnessProcessIds = new Set(
    state.processes.filter(({ command }) => hasPlaywrightDebugFlags(command)).map(({ pid }) => pid)
  );
  const candidates = state.listeners.filter(({ pid, port }) => harnessProcessIds.has(pid) && port !== backendPort);
  const candidateProcessIds = new Set(candidates.map(({ pid }) => pid));
  const playwrightHarnessListeners = candidates.length === 2 && candidateProcessIds.size === 1 ? candidates : [];

  return {
    playwrightHarnessListeners,
    applicationListeners: state.listeners.filter((listener) => !playwrightHarnessListeners.includes(listener)),
  };
}

const run = (command: string, args: string[]): string =>
  execFileSync(command, args, { encoding: 'utf8', timeout: 10_000 });

/** Captures all TCP listeners owned by the packaged Electron process and its descendants. */
export function captureProcessTreeNetworkState(rootPid: number): ProcessTreeNetworkState {
  let processes: ProcessTreeRecord[];
  let listeners: ProcessTreeListener[];

  if (process.platform === 'win32') {
    processes = parseWindowsProcesses(
      run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
      ])
    );
    listeners = parseWindowsListeners(
      run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-NetTCPConnection -State Listen | Select-Object OwningProcess,LocalAddress,LocalPort | ConvertTo-Json -Compress',
      ]),
      processes
    );
  } else {
    processes = parsePsProcessTable(run('ps', ['-axo', 'pid=,ppid=,command=']));
    listeners = parseLsofListeners(run('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-Fpcn']));
  }

  const processTreePids = collectProcessTreePids(processes, rootPid);
  const processCommands = new Map(processes.map(({ command, pid }) => [pid, command]));
  return {
    rootPid,
    processes: processes.filter(({ pid }) => processTreePids.has(pid)).toSorted((left, right) => left.pid - right.pid),
    listeners: listeners
      .filter(({ pid }) => processTreePids.has(pid))
      .map(({ address, command, pid, port, protocol }) => ({
        address,
        command: processCommands.get(pid) ?? command,
        pid,
        port,
        protocol,
      }))
      .toSorted((left, right) => left.pid - right.pid || left.port - right.port),
  };
}
