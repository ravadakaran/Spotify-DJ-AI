// Snapshots replace room state atomically. Notifications never reorder the queue.
export function createRoomSync({ apply, resync }) {
  let current = null,
    syncing = true,
    pending = [],
    retired = new Set();
  const request = () => {
    if (!syncing) {
      syncing = true;
      resync();
    }
  };
  const install = (state) => {
    current = state;
    apply(state);
  };
  const receive = (state) => {
    if (retired.has(state.epoch)) return;
    if (syncing) {
      pending.push(state);
      if (pending.length > 64) pending = pending.slice(-64);
      return;
    }
    if (
      state.epoch !== current.epoch ||
      state.revision > current.revision + 1
    ) {
      pending.push(state);
      request();
      return;
    }
    if (state.revision < current.revision) return;
    if (
      state.revision === current.revision &&
      state.serverTime < current.serverTime
    )
      return;
    install(state);
  };
  return {
    receive,
    begin() {
      syncing = true;
      pending = [];
    },
    snapshot(state) {
      if (current?.epoch !== state.epoch && current) retired.add(current.epoch);
      if (retired.size > 8) retired.delete(retired.values().next().value);
      if (
        !current ||
        state.epoch !== current.epoch ||
        state.revision >= current.revision
      )
        install(state);
      syncing = false;
      const buffered = pending;
      pending = [];
      for (const value of buffered) receive(value);
    },
  };
}
