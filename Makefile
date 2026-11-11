.PHONY: test verify arena fmt lint build-wasm test-integration

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

build-wasm:
	cargo build --workspace --target wasm32-unknown-unknown --release

test-integration: build-wasm
	cargo test -p loyal-cart-integration-tests --test flow -- --ignored --nocapture
