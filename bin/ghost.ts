#!/usr/bin/env node

import { cliApp } from "../src/cli-app.ts";

cliApp(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
