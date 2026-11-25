import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { StringDecoder } from 'string_decoder';

import { BlenderError } from './client.js';
import { byteLength, clipText } from './envelope.js';

export const RESULT_MARKER = '__HSA_BLENDER_RESULT__:';
export const DEFAULT_HEADLESS_TIMEOUT_MS = 60_000;
export const MAX_HEADLESS_TIMEOUT_MS = 180_000;
export const DEFAULT_HEADLESS_STDOUT_CAP = 8_000;

export interface HeadlessOptions {
  code: string;
  blendFile?: string;
  saveTo?: string;
  timeoutMs?: number;
  stdoutCapBytes?: number;
}

export interface HeadlessResult {
  result: unknown;
  saved_to: string | null;
  executable: string;
  stdout: string;
  stdout_truncated: boolean;
  stdout_bytes: number;
  stdout_bytes_dropped: number;
  elapsed_ms: number;
}

function isExecutableFile(candidate: string): boolean {
  try {
    return existsSync(candidate) && statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function findBlenderExecutable(): string | null {
  const envBlender = process.env.BLENDER_PATH;
  if (envBlender !== undefined && envBlender.trim() !== '') {
    // Explicit override must not silently fall back to another installed version
    // when misconfigured; callers and tests rely on a bad BLENDER_PATH failing fast.
    const candidate = envBlender.trim();
    return isExecutableFile(candidate) ? candidate : null;
  }

  if (process.platform === 'win32') {
    const roots = Array.from(
      new Set(
        [
          'C:\\Program Files\\Blender Foundation',
          process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Blender Foundation') : '',
        ].filter(Boolean),
      ),
    );
    for (const root of roots) {
      if (!existsSync(root)) continue;
      try {
        const dirs = readdirSync(root, { withFileTypes: true })
          .filter((d) => d.isDirectory() && /^blender\b/i.test(d.name))
          .map((d) => d.name)
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
        for (const dir of dirs) {
          const exe = join(root, dir, 'blender.exe');
          if (isExecutableFile(exe)) return exe;
        }
      } catch {
        // Unreadable Program Files directory should not block PATH lookup.
      }
    }
  } else if (process.platform === 'darwin') {
    const macApp = '/Applications/Blender.app/Contents/MacOS/Blender';
    if (isExecutableFile(macApp)) return macApp;
  } else {
    for (const linuxBin of ['/usr/bin/blender', '/snap/bin/blender', '/usr/local/bin/blender']) {
      if (isExecutableFile(linuxBin)) return linuxBin;
    }
  }

  const pathEnv = process.env.PATH ?? '';
  const binNames = process.platform === 'win32' ? ['blender.exe', 'blender'] : ['blender'];
  for (const entry of pathEnv.split(delimiter)) {
    const dir = entry.trim();
    if (!dir) continue;
    for (const bin of binNames) {
      const candidate = join(dir, bin);
      if (isExecutableFile(candidate)) return candidate;
    }
  }

  return null;
}

function buildRunnerScript(code: string, saveTo?: string): string {
  return [
    'import bpy',
    'import json',
    'import os',
    'import sys',
    'import traceback',
    '',
    `_HSA_MARKER = ${JSON.stringify(RESULT_MARKER)}`,
    `_HSA_CODE = json.loads(${JSON.stringify(JSON.stringify(code))})`,
    `_HSA_SAVE_TO = json.loads(${JSON.stringify(JSON.stringify(saveTo ?? null))})`,
    '_HSA_REAL_STDOUT = sys.stdout',
    '',
    'def _hsa_jsonable(value):',
    '    if value is None or isinstance(value, (bool, int, float, str)):',
    '        return value',
    '    if isinstance(value, (list, tuple)):',
    '        return [_hsa_jsonable(v) for v in value]',
    '    if isinstance(value, dict):',
    '        return {str(k): _hsa_jsonable(v) for k, v in value.items()}',
    '    name = getattr(value, "name", None)',
    '    rna_type = getattr(value, "bl_rna", None)',
    '    return {',
    '        "repr": repr(value)[:200],',
    '        "name": str(name) if isinstance(name, str) else None,',
    '        "rna_type": rna_type.identifier if rna_type is not None else None,',
    '    }',
    '',
    '_hsa_ns = {"bpy": bpy, "__name__": "__hsa_headless__"}',
    '_hsa_payload = {"ok": False, "result": None, "saved_to": None, "error": None, "traceback": None}',
    'try:',
    '    exec(compile(_HSA_CODE, "<hsa-headless>", "exec"), _hsa_ns)',
    '    if _HSA_SAVE_TO:',
    '        _save_abs = os.path.abspath(_HSA_SAVE_TO)',
    '        _save_dir = os.path.dirname(_save_abs)',
    '        if _save_dir:',
    '            os.makedirs(_save_dir, exist_ok=True)',
    '        bpy.ops.wm.save_as_mainfile(filepath=_save_abs)',
    '        _hsa_payload["saved_to"] = _save_abs',
    '    _hsa_payload["ok"] = True',
    '    _hsa_payload["result"] = _hsa_jsonable(_hsa_ns.get("_result"))',
    'except BaseException as _exc:',
    '    traceback.print_exc()',
    '    _hsa_payload["ok"] = False',
    '    _hsa_payload["error"] = "%s: %s" % (type(_exc).__name__, _exc)',
    '    _hsa_payload["traceback"] = traceback.format_exc()[-2000:]',
    '',
    '_HSA_REAL_STDOUT.write("\\n" + _HSA_MARKER + json.dumps(_hsa_payload, ensure_ascii=False) + "\\n")',
    '_HSA_REAL_STDOUT.flush()',
    'if not _hsa_payload["ok"]:',
    '    sys.exit(1)',
  ].join('\n');
}

function spawnBlenderProcess(executable: string, blenderArgs: string[]) {
  // Allowing .py/.mjs/.js targets via BLENDER_PATH lets CI and Windows test suites
  // exercise the real subprocess framing without compiling a native .exe stand-in.
  const lower = executable.toLowerCase();
  if (lower.endsWith('.mjs') || lower.endsWith('.js')) {
    return spawn(process.execPath, [executable, ...blenderArgs], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  if (lower.endsWith('.py')) {
    const py = process.env.HSA_TEST_PYTHON || 'python';
    return spawn(py, [executable, ...blenderArgs], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return spawn(executable, blenderArgs, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function runBlenderHeadless(opts: HeadlessOptions): Promise<HeadlessResult> {
  if (!opts.code || !opts.code.trim()) {
    throw new BlenderError('code is required');
  }

  const executable = findBlenderExecutable();
  if (!executable) {
    throw new BlenderError(
      'Blender executable not found. Install Blender (https://www.blender.org/download/) ' +
        'or set the BLENDER_PATH environment variable to the full path of the blender binary.',
    );
  }

  const timeoutMs = Math.min(
    Math.max(50, Math.floor(opts.timeoutMs ?? DEFAULT_HEADLESS_TIMEOUT_MS)),
    MAX_HEADLESS_TIMEOUT_MS,
  );
  const stdoutCapBytes = Math.max(0, Math.floor(opts.stdoutCapBytes ?? DEFAULT_HEADLESS_STDOUT_CAP));

  const tempScriptPath = join(tmpdir(), `hsa-blender-runner-${randomBytes(8).toString('hex')}.py`);
  writeFileSync(tempScriptPath, buildRunnerScript(opts.code, opts.saveTo), {
    encoding: 'utf8',
    mode: 0o600,
  });

  const args = [
    '--background',
    ...(opts.blendFile ? [opts.blendFile] : ['--factory-startup']),
    '--python',
    tempScriptPath,
  ];

  const startedAt = Date.now();
  const MAX_LINE_BUFFER = 4 * 1024 * 1024;

  try {
    return await new Promise<HeadlessResult>((resolve, reject) => {
      const child = spawnBlenderProcess(executable, args);
      const outDecoder = new StringDecoder('utf8');
      const errDecoder = new StringDecoder('utf8');

      let partialLine = '';
      let discardCurrentLine = false;
      let markerLine: string | null = null;

      let keptStdout = '';
      let keptBytes = 0;
      let totalUserBytes = 0;
      let stderrText = '';
      let timedOut = false;
      let settled = false;

      const appendUserText = (piece: string) => {
        if (!piece) return;
        const pieceBytes = byteLength(piece);
        totalUserBytes += pieceBytes;
        if (keptBytes < stdoutCapBytes + 16) {
          keptStdout += piece;
          keptBytes += pieceBytes;
        }
      };

      const processCompleteLine = (rawLine: string, withNewline: boolean) => {
        const trimmedRight = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (trimmedRight.startsWith(RESULT_MARKER)) {
          markerLine = trimmedRight.slice(RESULT_MARKER.length).trim();
          return;
        }
        appendUserText(withNewline ? rawLine + '\n' : rawLine);
      };

      const consumeStdout = (text: string) => {
        let cursor = 0;
        while (cursor < text.length) {
          const nl = text.indexOf('\n', cursor);
          if (nl === -1) {
            const rest = text.slice(cursor);
            if (discardCurrentLine) {
              appendUserText(rest);
            } else {
              partialLine += rest;
              if (partialLine.length > MAX_LINE_BUFFER && !partialLine.startsWith(RESULT_MARKER)) {
                appendUserText(partialLine);
                partialLine = '';
                discardCurrentLine = true;
              }
            }
            break;
          }

          const segment = text.slice(cursor, nl);
          cursor = nl + 1;
          if (discardCurrentLine) {
            appendUserText(segment + '\n');
            discardCurrentLine = false;
          } else {
            const fullLine = partialLine + segment;
            partialLine = '';
            processCompleteLine(fullLine, true);
          }
        }
      };

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // Process may have already exited while the timer callback was queued.
        }
        if (!settled) {
          settled = true;
          reject(new BlenderError(`Blender headless timed out after ${timeoutMs}ms`, 'timeout'));
        }
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        consumeStdout(outDecoder.write(chunk));
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrText.length < 16_000) {
          stderrText += errDecoder.write(chunk);
        }
      });

      child.once('error', (err: Error) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(new BlenderError(`Failed to spawn Blender headless (${executable}): ${err.message}`));
      });

      child.once('close', (exitCode: number | null) => {
        clearTimeout(timer);
        if (settled || timedOut) return;
        settled = true;

        const tailOut = outDecoder.end();
        if (tailOut) consumeStdout(tailOut);
        stderrText += errDecoder.end();

        if (partialLine) {
          if (discardCurrentLine) {
            appendUserText(partialLine);
          } else {
            processCompleteLine(partialLine, false);
          }
          partialLine = '';
        }

        const clipped = clipText(keptStdout, stdoutCapBytes);
        const droppedBytes = Math.max(0, totalUserBytes - clipped.bytes_returned);
        const truncated = droppedBytes > 0;

        if (markerLine !== null) {
          let parsed: {
            ok?: boolean;
            result?: unknown;
            saved_to?: string | null;
            error?: string | null;
            traceback?: string | null;
          };
          try {
            parsed = JSON.parse(markerLine);
          } catch (err) {
            reject(
              new BlenderError(
                `Failed to parse Blender headless result JSON: ${(err as Error).message}`,
                markerLine.slice(0, 500),
              ),
            );
            return;
          }

          if (!parsed.ok) {
            reject(
              new BlenderError(
                parsed.error || 'Headless Blender script failed',
                parsed.traceback || stderrText.trim() || clipped.text,
              ),
            );
            return;
          }

          resolve({
            result: parsed.result ?? null,
            saved_to: parsed.saved_to ?? null,
            executable,
            stdout: clipped.text,
            stdout_truncated: truncated,
            stdout_bytes: clipped.bytes_returned,
            stdout_bytes_dropped: droppedBytes,
            elapsed_ms: Date.now() - startedAt,
          });
          return;
        }

        reject(
          new BlenderError(
            `Blender headless exited (code ${exitCode ?? 'null'}) without producing ${RESULT_MARKER}`,
            stderrText.trim() || clipped.text,
          ),
        );
      });
    });
  } finally {
    try {
      rmSync(tempScriptPath, { force: true });
    } catch {
      // Best-effort cleanup of temp runner script.
    }
  }
}
