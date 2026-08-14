export interface ReplyTimerRegistry {
  schedule(roomId: string, callback: () => void, delay: number): void
  cancel(roomId: string): void
  dispose(): void
}

export function createReplyTimerRegistry(
  schedule: (callback: () => void, delay: number) => number = (callback, delay) => (
    globalThis.setTimeout(callback, delay) as unknown as number
  ),
  cancel: (timer: number) => void = timer => globalThis.clearTimeout(timer)
): ReplyTimerRegistry {
  const timersByRoom = new Map<string, Set<number>>()

  return {
    schedule(roomId, callback, delay) {
      const timer = schedule(() => {
        const roomTimers = timersByRoom.get(roomId)
        roomTimers?.delete(timer)
        if (!roomTimers?.size) timersByRoom.delete(roomId)
        callback()
      }, delay)
      const roomTimers = timersByRoom.get(roomId) ?? new Set<number>()
      roomTimers.add(timer)
      timersByRoom.set(roomId, roomTimers)
    },
    cancel(roomId) {
      const roomTimers = timersByRoom.get(roomId)
      if (!roomTimers) return
      for (const timer of roomTimers) cancel(timer)
      timersByRoom.delete(roomId)
    },
    dispose() {
      for (const roomId of timersByRoom.keys()) this.cancel(roomId)
    }
  }
}
