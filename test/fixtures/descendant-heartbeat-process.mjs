import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const readyPath = process.env.EVERFOREST_DESCENDANT_READY_PATH;
const heartbeatPath = process.env.EVERFOREST_DESCENDANT_HEARTBEAT_PATH;
if (!readyPath || !heartbeatPath) {
  throw new Error("Descendant heartbeat fixture requires ready and heartbeat paths");
}

if (process.env.EVERFOREST_DESCENDANT_HEARTBEAT_CHILD === "1") {
  writeFileSync(readyPath, String(process.pid));
  let heartbeatSequence = 0;
  setInterval(() => writeFileSync(heartbeatPath, String(++heartbeatSequence)), 20);
} else {
  spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, EVERFOREST_DESCENDANT_HEARTBEAT_CHILD: "1" },
    stdio: "ignore",
  });
  setTimeout(() => {}, 20_000);
}
