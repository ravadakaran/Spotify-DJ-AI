import { parentPort, workerData } from "node:worker_threads";
import { fit } from "./model.js";
parentPort.postMessage(fit(workerData));
