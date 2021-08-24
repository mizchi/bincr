build:
	cd packages/a && npx bincr
	cd packages/b && npx bincr

watch:
	sh -c "cd packages/a && npx bincr -w" & sh -c "cd packages/b && npx bincr -w" & wait 

.PHONY: build