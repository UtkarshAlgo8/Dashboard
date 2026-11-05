#!/usr/bin/env node
/** Emit the app's canonical, read-only Athena snapshot SQL for the Gold job. */
import { liveRunningSkusQuery } from "../../src/queries/live-running-skus.js";

// No config import, credentials, network requests, DDL or writes. Keeping one
// query builder prevents the app and the data-team handoff from drifting.
process.stdout.write(`${liveRunningSkusQuery()};\n`);
