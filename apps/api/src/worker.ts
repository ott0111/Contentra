import { queue } from "./jobs.js";

const pollMs = Number(process.env.WORKER_POLL_MS ?? 1000);

async function pump() {
  if (draining) return;
  try {
    while (draining === false && (await queue.runOnce()) === true) {
      // drain available jobs before waiting for the next poll
    }
  } catch (error) {
    console.error("worker tick failed", error);
  }
}

let draining = false;

const timer = setInterval(() => void pump(), pollMs);
timer.unref?.();

void pump();

function shutdown(signal: string) {
  draining = true;
  clearInterval(timer);
  console.log(`contentra worker received ${signal}; draining in-flight job before exit`);
  const guard = setTimeout(() => process.exit(0), 5000);
  guard.unref?.();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(`contentra worker running (poll ${pollMs}ms). Handlers: push_delivery, cleanup.`);