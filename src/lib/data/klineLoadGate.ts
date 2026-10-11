/** Bound upstream work for distinct cold keys; identical requests are coalesced earlier. */
export class KlineLoadGate {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private concurrency = 8, private queueLimit = 128, private waitMs = 10_000) {}
  async run<T>(load: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.queue.length >= this.queueLimit) throw new Error("行情请求繁忙，请稍后重试");
      await new Promise<void>((resolve, reject) => {
        const start = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          const index = this.queue.indexOf(start);
          if (index >= 0) this.queue.splice(index, 1);
          reject(new Error("行情请求繁忙，排队超时，请稍后重试"));
        }, this.waitMs);
        this.queue.push(start);
      });
    } else this.active++;
    try { return await load(); }
    finally {
      const next = this.queue.shift();
      if (next) next(); // Transfer the occupied slot, preventing newcomers overtaking waiters.
      else this.active--;
    }
  }
}
