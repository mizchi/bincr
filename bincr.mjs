#!/usr/bin/env node
import meow from "meow";
import path from "path";
import glob from "glob";
import fs from "fs/promises";
import crypto from "crypto";
import { promisify } from "util";
import { spawn } from "child_process";
import chokidar from "chokidar";

const CONFIG_PATH = ".bincr.json";
const HASH_PATH = ".bincr-hash";
const LOCK_PATH = ".bincr-lock";

let LOG_PREFIX = "bincr";

const cli = meow(
  `
	Usage
    $ bincr init
    $ bincr [<cmd>] [--watch, -w]
    $ bincr changed [--update, -u] && <cmd> # return status code
    $ bincr watch

	Options
    --force, -f Run command force
    --dry, -d Skip hash update
    --update, -u Update hash with "changed"
    --watch, -w Watch command force

	Examples
    $ bincr 
    $ bincr -w
    $ bincr changed -u && echo "detect changed"
    $ bincr "npm run build"
`,
  {
    importMeta: import.meta,
    flags: {
      prefix: {
        type: "string",
        alias: "-p",
      },
      watch: {
        type: "boolean",
        alias: "-w",
      },
      force: {
        type: "boolean",
        alias: "-f",
      },
      dry: {
        type: "boolean",
        alias: "-d",
      },
    },
  }
);

const log = (...args) => console.log(`[${LOG_PREFIX}]`, ...args);

async function readConfig(base) {
  return JSON.parse(await fs.readFile(path.join(base, CONFIG_PATH), "utf8"));
}

async function getLastBuildHash(base) {
  return await fs
    .readFile(path.join(base, HASH_PATH), "utf8")
    .catch(() => "<init>");
}

async function removeLock(base) {
  const lockPath = path.join(base, LOCK_PATH);
  if (await exists(lockPath)) {
    await fs.unlink(lockPath);
  }
}

async function saveBuildHash(base, hash) {
  return await fs.writeFile(path.join(base, HASH_PATH), hash);
}

async function getDirHashes(base, pattern) {
  const files = await promisify(glob)(pattern, { cwd: base, nodir: true });
  const hashes = await Promise.all(
    files.map(async (fpath) => {
      const content = await fs.readFile(path.join(base, fpath));
      const hash = crypto.createHash("md5").update(content).digest("hex");
      return [fpath, hash];
    })
  );
  return hashes;
}

async function createHash(base, watchTargets) {
  const hashes = (
    await Promise.all(watchTargets.map((t) => getDirHashes(base, t)))
  ).flat(1);
  const view = hashes.map(([fpath, hash]) => `${fpath}:${hash}`).join("\n");
  const result = crypto.createHash("md5").update(view).digest("hex");
  return result;
}

async function spawnCmd(base, rawCmd) {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = rawCmd.split(" ");
    const spawned = spawn(cmd, args, { cwd: base, stdio: "inherit" });
    spawned.on("exit", (code) => (code ? reject(code) : resolve(code)));
  });
}

async function exists(filepath) {
  try {
    return (await fs.lstat(filepath)).isFile();
  } catch (e) {
    return false;
  }
}

async function run(base, config, flags, cmd) {
  const lockPath = path.join(base, LOCK_PATH);
  if (await exists(lockPath)) {
    log(`build locked`);
    return;
  }

  const hash = await createHash(base, config.watch);
  const lastHash = await getLastBuildHash(base);
  const changed = flags.force || lastHash !== hash;
  const isDry = flags.dry;
  if (!changed) {
    log("skip", base);
    return;
  }
  // run
  log("changes detected", hash);
  await fs.writeFile(lockPath, Date.now().toString());
  await spawnCmd(base, cmd);
  await removeLock(base);
  if (isDry) {
    log("run without hash update", hash);
  } else {
    log(`update ${HASH_PATH}`, hash);
    await saveBuildHash(base, hash);
  }
}

async function main() {
  const base = process.cwd();
  if (cli.flags.prefix) {
    LOG_PREFIX = "bincr:" + prefix;
  }

  if (cli.input[0] === "init") {
    const configPath = path.join(base, CONFIG_PATH);
    if (await exists(configPath)) {
      log(`${configPath} already exists`);
      return;
    }
    await fs.writeFile(
      configPath,
      JSON.stringify(
        { cmd: "echo 'Edit .bincr.json cmd'", watch: ["src/**"] },
        null,
        2
      )
    );
    await fs.writeFile(path.join(base, HASH_PATH), "<init>");
    log("generate .bincr.json");
    log(`Add ignore rule to .gitignore:

    echo "${HASH_PATH}" >> .gitignore
    echo "${LOCK_PATH}" >> .gitignore

    `);
    return;
  }

  let config;
  try {
    config = await readConfig(base);
  } catch (err) {
    log(".bincr.json not found. Run `bincr init` first");
    return process.exit(1);
  }

  if (cli.input[0] === "workspace") {
    const ws = config.workspaces || [];
    if (ws.length === 0) {
      console.error("no workspace");
      process.exit(1);
    }
    const processes = ws.map((wsPath) => {
      let args = ["bincr", "--prefix", wsPath];
      if (cli.flags.watch) {
        args.push("-w");
      }
      const dir = path.join(base, wsPath);
      log("spawn", "npx", args, dir);
      return spawn("npx", args, {
        cwd: dir,
        stdio: "inherit",
        env: process.env,
      });
    });
    process.on("exit", (code) => {
      processes.forEach((p) => {
        p.kill();
      });
    });
    process.on("SIGINT", () => process.exit(0));
    return;
  }

  const cmd = cli.input[0] ?? config.cmd;

  if (cli.flags.watch) {
    await removeLock(base);

    process.on("exit", async () => {
      log("Exitting...");
      await removeLock(base);
    });
    process.on("SIGINT", () => process.exit(0));

    const runD = debounced(500, run);
    chokidar.watch(config.watch, { cwd: base }).on("all", async (fpath) => {
      log(`[watch] ${fpath} changed`);
      runD(base, config, cli.flags, cmd);
    });
    return;
  } else {
    await run(base, config, cli.flags, cmd);
  }
}

function debounced(ms, cb) {
  let timeout;
  return (...args) => {
    log(`[watch] received...`);
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      log(`[watch] exec`);
      cb(...args);
    }, ms);
  };
}

main().catch(console.error);
