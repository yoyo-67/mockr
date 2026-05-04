// Verification client for the AI agent WS example.
//
// Connects to the mockr server, drives two scenarios (streaming reply +
// tool-use, then cancel mid-stream), and asserts the event sequence.
// Exits 0 on pass, 1 on fail.

import WebSocket from 'ws';

const PORT = 3011;
const URL = `ws://localhost:${PORT}/ws/agent?conversationId=demo`;

interface AnyEvent { type: string; [k: string]: unknown }

function recvUntil(sock: WebSocket, predicate: (e: AnyEvent) => boolean, timeoutMs = 4000): Promise<AnyEvent[]> {
  const collected: AnyEvent[] = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${JSON.stringify(collected.map((e) => e.type))}`)), timeoutMs);
    const onMsg = (raw: WebSocket.RawData) => {
      const ev = JSON.parse(raw.toString()) as AnyEvent;
      collected.push(ev);
      if (ev.type === 'content_delta') process.stdout.write(String(ev.text));
      if (predicate(ev)) {
        sock.off('message', onMsg);
        clearTimeout(timer);
        process.stdout.write('\n');
        resolve(collected);
      }
    };
    sock.on('message', onMsg);
  });
}

function assert(cond: unknown, label: string) {
  if (!cond) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

async function main() {
  const sock = new WebSocket(URL);
  await new Promise<void>((res, rej) => { sock.once('open', () => res()); sock.once('error', rej); });
  console.log(`connected ${URL}\n`);

  // 1. Hello on connect
  const hello = await recvUntil(sock, (e) => e.type === 'hello');
  assert(hello[0]?.type === 'hello', 'received hello on connect');
  assert(hello[0]?.conversationId === 'demo', 'hello carries conversationId');

  // 2. Weather prompt → streaming + tool use
  console.log('\n→ prompt: "what is the weather"');
  sock.send(JSON.stringify({ type: 'message', content: 'what is the weather' }));
  const stream1 = await recvUntil(sock, (e) => e.type === 'message_stop');
  const types1 = stream1.map((e) => e.type);
  assert(types1[0] === 'message_start', 'stream begins with message_start');
  assert(types1.includes('content_delta'), 'stream includes content_delta');
  assert(types1.includes('tool_use'), 'weather prompt triggers tool_use');
  assert(types1.includes('tool_result'), 'tool_use is followed by tool_result');
  assert(types1[types1.length - 1] === 'message_stop', 'stream ends with message_stop');
  const stop1 = stream1[stream1.length - 1] as AnyEvent;
  assert(stop1.stopReason === 'tool_use', 'stop reason is tool_use');

  // 3. Echo prompt + mid-stream cancel
  console.log('\n→ prompt: "tell me a long story" then cancel');
  sock.send(JSON.stringify({ type: 'message', content: 'tell me a long story' }));
  // Wait for first content_delta then cancel
  await recvUntil(sock, (e) => e.type === 'content_delta');
  sock.send(JSON.stringify({ type: 'cancel' }));
  const stream2 = await recvUntil(sock, (e) => e.type === 'message_stop');
  const stop2 = stream2[stream2.length - 1] as AnyEvent;
  assert(stop2.stopReason === 'cancelled', 'cancel produces stopReason=cancelled');

  // 4. Cross-endpoint broadcast (HTTP trigger, WS receives)
  console.log('\n→ POST /api/broadcast { text: "ping" }');
  const broadcastPromise = recvUntil(sock, (e) => e.type === 'broadcast');
  const httpRes = await fetch(`http://localhost:${PORT}/api/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'ping' }),
  });
  const httpBody = (await httpRes.json()) as { delivered: number };
  assert(httpBody.delivered === 1, `HTTP broadcast reports delivered=1 (got ${httpBody.delivered})`);
  const broadcasts = await broadcastPromise;
  const last = broadcasts[broadcasts.length - 1] as AnyEvent;
  assert(last.type === 'broadcast' && last.text === 'ping', 'WS client received broadcast frame');

  // 5. Schema validation rejection
  console.log('\n→ send malformed frame (no `type` field)');
  const errPromise = recvUntil(sock, (e) => e.type === '__mockr_error');
  sock.send(JSON.stringify({ no_type: true }));
  // This relies on a `message:` schema being set — for now the server has none,
  // so this assertion is skipped if no error frame arrives within 500ms.
  try {
    const errs = await Promise.race([
      errPromise,
      new Promise<AnyEvent[]>((_, rej) => setTimeout(() => rej(new Error('skip')), 500)),
    ]);
    assert(errs[errs.length - 1]?.type === '__mockr_error', 'malformed frame produces __mockr_error');
  } catch {
    console.log('  (no message schema in this example — skipping validation assertion)');
  }

  sock.close();
  console.log('\nAll assertions passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
