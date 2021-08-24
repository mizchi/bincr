# bincr

Super simple incremental build helper. (inspired by bazel)

```bash
$ npx bincr init
# edit `.bincr.json`'s watch and cmd
# echo ".bincr-hash" >> .gitignore 
$ npx bincr exec # Run command with update .bincr-hash
$ npx bincr exec # Skip because of same hash
# edit targets ...
$ npx bincr exec # Run command by target changes
```

## How it works

- Generate merkle hash for watched targets
- Compare `.bincr-hash` and current hash
- Run cmd if hash changed
- Update `.bincr-hash`

## How to use: Exec

```bash
$ npx bincr exec # run default
$ npx bincr exec "npm run build" # run default
$ npx bincr exec -f # run force
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

## LICENSE

MIT