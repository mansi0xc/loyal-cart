.PHONY: test verify arena fmt lint

test:
	cargo test --workspace
	npm test

verify:
	node packages/verifier/verify.mjs --fixture fixtures/arena.json

arena:
	node packages/arena/arena.mjs --fixture fixtures/arena.json

fmt:
	cargo fmt --all -- --check

lint:
	cargo clippy --workspace --all-targets -- -D warnings
