import { AgentsMcpError } from './errors';
import type { IncomingMessage } from 'node:http';

/** Reads one loopback JSON request without allowing an unbounded body into Electron main. */
export async function readBoundedJsonRequest(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > maxBytes) throw new AgentsMcpError('invalid_input', 'Agents invoke request is too large');
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new AgentsMcpError('invalid_input', 'Agents invoke request is not valid JSON');
  }
}

/** Reads one JSON response without allowing an unbounded body into Adapter memory. */
export async function readBoundedJsonResponse(response: Response, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new AgentsMcpError('contract', 'Agents catalog response exceeds the supported byte capacity');
  }
  if (!response.body) throw new AgentsMcpError('contract', 'Agents catalog response body is missing');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new AgentsMcpError('contract', 'Agents catalog response exceeds the supported byte capacity');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new AgentsMcpError('contract', 'Agents catalog response is not valid UTF-8 JSON');
  }
}
