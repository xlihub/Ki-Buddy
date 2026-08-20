import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { readBoundedJsonRequest } from '@/process/ki-buddy/agents/json';

function requestBody(chunks: readonly string[]): IncomingMessage {
  return Readable.from(chunks) as unknown as IncomingMessage;
}

describe('readBoundedJsonRequest', () => {
  it('accepts a JSON request at the exact byte limit', async () => {
    await expect(readBoundedJsonRequest(requestBody(['{"ok":true}']), 11)).resolves.toEqual({ ok: true });
  });

  it('rejects a request as soon as its chunks exceed the byte limit', async () => {
    await expect(readBoundedJsonRequest(requestBody(['{"ok":', 'true}']), 10)).rejects.toThrow(
      'Agents invoke request is too large'
    );
  });

  it.each([
    ['empty', []],
    ['invalid', ['{"ok":']],
  ])('rejects an %s request body', async (_name, chunks) => {
    await expect(readBoundedJsonRequest(requestBody(chunks), 1024)).rejects.toThrow(
      'Agents invoke request is not valid JSON'
    );
  });
});
