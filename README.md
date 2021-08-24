# bincr

Super simple incremental build helper. (inspired by bazel)

```bash
$ npx bincr init
# edit `.bincr.json`'s watch and cmd
# echo ".bincr-hash" >> .gitignore 
$ npx bincr # Run command with update .bincr-hash

# second run
$ npx bincr # Skip because of same hash

# after watch targets ...
$ npx bincr # Run command by target changes

# watch!
$ npx bincr -w
```

## How it works

- Generate merkle hash for watched targets
- Compare `.bincr-hash` and current hash
- Run `cmd` if hash changed
- Update `.bincr-hash`

## How to use: Exec

```bash
$ npx bincr # run default
$ npx bincr "npm run build" # run default
$ npx bincr -f # run force
```

## How to use: Status Code

```bash
$ npx bincr changed && echo 1
# with hash update
$ npx bincr changed -u && echo 1
```

## Config: .bincr.json

```json
{
  "watch": ["src/**"], # hash targets
  "cmd": "npm run build"
}
```

## Workspace

Run mutiple bincr project

```json
{
  "watch": [],
  "cmd": "echo 'no build task'",
  "workspaces": ["packages/a", "packages/b"]
}
```

```bash
## run
$ npx bincr workspace

## watch
$ npx bincr workspace -w
```

## LICENSE

MIT