#!/usr/bin/env node
/**
 * Direct launcher for @tauri-apps/cli.
 *
 * The package's own bin wrapper (node_modules/@tauri-apps/cli/tauri.js) sniffs
 * process.argv[0] to build a friendly binary name. When `node` is a shim whose
 * executable is not named *node* (e.g. Kimi Work's bundled runtime), the sniff
 * fails and the wrapper injects the shim path as the first CLI argument, so
 * cargo-tauri dies with: "unrecognized subcommand '...Kimi.exe'".
 *
 * This launcher skips the sniffing entirely and hands the arguments straight
 * to the native CLI. It also prepends the default rustup cargo bin directory
 * to PATH when cargo is not resolvable, so builds work from stripped-down
 * shells (again, e.g. Kimi Work's).
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Ensure cargo is reachable for the child processes the CLI spawns.
function ensureCargoInPath() {
  const pathVar = process.env.PATH || process.env.Path || '';
  const segments = pathVar.split(path.delimiter).map((s) => s.toLowerCase());
  const onPath = segments.some((s) => s.endsWith(path.join('.cargo', 'bin').toLowerCase()));
  if (onPath) return;
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return;
  const cargoBin = path.join(home, '.cargo', 'bin');
  if (fs.existsSync(path.join(cargoBin, 'cargo.exe')) || fs.existsSync(path.join(cargoBin, 'cargo'))) {
    process.env.PATH = cargoBin + path.delimiter + pathVar;
  }
}

ensureCargoInPath();

const cli = require('@tauri-apps/cli/main');
const args = process.argv.slice(2);

const binName = process.env.npm_lifecycle_event
  ? `npm run ${process.env.npm_lifecycle_event}`
  : 'node scripts/tauri-cli.cjs';

cli.run(args, binName).catch((err) => {
  cli.logError(err.message);
  process.exit(1);
});
