// Record only enumerated events, lengths and offsets. No MIME strings, payloads,
// object URLs, exception messages or browsing identifiers cross the bridge.
export function installMediaSourceDiagnostics(win) {
  if (
    win.__ytafMediaSourceTracing ||
    !win.MediaSource ||
    !win.h5vcc?.system?.traceYtafMediaSource
  )
    return false;
  const api = win.h5vcc.system;
  const proto = win.MediaSource.prototype;
  const original = proto.addSourceBuffer;
  if (typeof original !== 'function') return false;
  const sources = new WeakMap();
  let nextSource = 0;
  function trace(
    source,
    event,
    stream = 0,
    bytes = 0,
    offset = 0,
    sequence = source.sequence
  ) {
    // Firmware/reporting failures must not interrupt MediaSource operations.
    try {
      api.traceYtafMediaSource(
        source.id,
        sequence,
        event,
        stream,
        bytes,
        offset
      );
    } catch (_) {
      /* best effort */
    }
  }
  function sourceState(ms) {
    let state = sources.get(ms);
    if (state) return state;
    state = { id: ++nextSource, sequence: 0 };
    sources.set(ms, state);
    ['sourceopen', 'sourceclose', 'sourceended'].forEach((name, index) => {
      ms.addEventListener(name, () => trace(state, index));
    });
    // The first addSourceBuffer normally happens after sourceopen.
    if (ms.readyState === 'open') trace(state, 0);
    return state;
  }
  const instrumented = function (type) {
    let state;
    try {
      state = sourceState(this);
    } catch (_) {
      return original.apply(this, arguments);
    }
    const stream =
      typeof type === 'string'
        ? /^audio\//i.test(type)
          ? 1
          : /^video\//i.test(type)
            ? 2
            : 0
        : 0;
    let buffer;
    try {
      buffer = original.apply(this, arguments);
    } catch (error) {
      trace(state, 9, stream);
      throw error;
    }
    try {
      const append = buffer.appendBuffer;
      let lastOffset = buffer.timestampOffset;
      // updateend is queued asynchronously. Another operation may start from
      // an update listener before the previous updateend is dispatched.
      const completions = [];
      function offsetOf(buffer) {
        try { return Number(buffer.timestampOffset) || 0; } catch (_) { return 0; }
      }
      // Install listeners first: if a binding rejects listener registration,
      // leave appendBuffer untouched rather than accumulating orphaned entries.
      buffer.addEventListener('error', () => {
        const pending = completions[0];
        if (pending && !pending.failed) {
          pending.failed = true;
          trace(state, 8, stream, 0, offsetOf(buffer), pending.sequence);
        }
      });
      buffer.addEventListener('updateend', () => {
        const completed = completions.shift();
        if (completed?.sampled && !completed.failed)
          trace(state, 4, stream, 0, offsetOf(buffer), completed.sequence);
      });
      buffer.appendBuffer = function (data) {
        // Cobalt may apply timestampOffset without calling a JS setter wrapper.
        const offset = offsetOf(this);
        if (offset !== lastOffset) {
          trace(state, 6, stream, 0, offset);
          lastOffset = offset;
        }
        state.sequence += 1;
        const appendSequence = state.sequence;
        const sampled = state.sequence <= 8 || state.sequence % 64 === 0;
        let bytes = 0;
        try { bytes = Number(data?.byteLength) || 0; } catch (_) { /* metadata only */ }
        if (sampled) trace(state, 3, stream, bytes, offset);
        try {
          const result = append.apply(this, arguments);
          completions.push({ sampled, sequence: appendSequence });
          return result;
        } catch (error) {
          trace(state, 8, stream, 0, offset, appendSequence);
          throw error;
        }
      };
      ['abort', 'remove'].forEach((name, index) => {
        const operation = buffer[name];
        if (typeof operation !== 'function') return;
        buffer[name] = function () {
          trace(state, index === 0 ? 5 : 7, stream, 0, offsetOf(this));
          const result = operation.apply(this, arguments);
          // remove also generates updateend; abort completes the operation
          // already queued. A rejected call generates neither.
          if (name === 'remove') completions.push(null);
          return result;
        };
      });
    } catch (_) {
      /* Read-only bindings can still play without instrumentation. */
    }
    return buffer;
  };
  try {
    proto.addSourceBuffer = instrumented;
  } catch (_) {
    return false;
  }
  win.__ytafMediaSourceTracing = true;
  return true;
}
