#!/usr/bin/env node
import meow from "meow";
import path from "path";
import glob from "glob";
import fs from "fs/promises";
import crypto from "crypto";
import { promisify } from "util";
import { spawn } from "child_process";

const CONFIG_PATH = ".bincr.json";
const HASH_PATH = ".bincr-hash";

const cli = meow(
  `
	Usage
    $ bincr init
    $ bincr exec <cmd>
    $ bincr changed [--update, -u] && <cmd> # return status code

	Options
    --force, -f Run command force
    --dry, -d Skip hash update
    --update, -u Update hash with "changed"

	Examples
    $ bincr changed -u && echo "detect changed"
    $ bincr exec "npm run build"
`,
  {
    importMeta: import.meta,
    flags: {
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

const log = (...args) => console.log("[bincr]", ...args);

async function readConfig(base) {
  return JSON.parse(await fs.readFile(path.join(base, CONFIG_PATH), "utf8"));
}

async function getLastBuildHash(base) {
  return await fs
    .readFile(path.join(base, HASH_PATH), "utf8")
    .catch(() => "<init>");
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

async function main() {
  const base = process.cwd();

  if (cli.input[0] === "init") {
    const configPath = path.join(base, CONFIG_PATH);
    if (await exists(configPath)) {
      log(`${configPath} already exists`);
      return;
    }
    await fs.writeFile(
      configPath,
      JSON.stringify({ cmd: "npm run build", watch: ["src/**"] }, null, 2)
    );
    await fs.writeFile(path.join(base, HASH_PATH), "<init>");
    log("generate .bincr.json");
    log(`Add ignore rule to .gitignore:

    echo "${HASH_PATH}" >> .gitignore
    `);
    return;
  }

  if (cli.input[0] === "exec") {
    let config;
    try {
      config = await readConfig(base);
    } catch (err) {
      log(".bincr.json not found. Run `bincr init` first");
      return process.exit(1);
    }

    const hash = await createHash(base, config.watch);
    const lastHash = await getLastBuildHash(base);
    const changed = cli.flags.force || lastHash !== hash;
    const isDry = cli.flags.dry;
    if (cli.input[0] === "changed") {
      cli.input.update && (await saveBuildHash(base, hash));
      process.exit(changed ? 0 : 1);
    }
    if (!changed) {
      log("skip", base);
      return;
    }

    // run
    log("changes detected", hash);
    const cmd = cli.input[1] ?? config.cmd;
    await spawnCmd(base, cmd);
    if (isDry) {
      log("run without hash update", hash);
    } else {
      log(`update ${HASH_PATH}`, hash);
      await saveBuildHash(base, hash);
    }
  }
}

main().catch(console.error);
