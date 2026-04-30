# Contributing

Thanks for taking a look at Layoutmaster.

## Local Setup

```bash
npm install
npm run build
npm test
```

The browser demos are served from the repository root:

```bash
npm run serve
```

Then open `http://127.0.0.1:4173/demos/`.

## Project Boundaries

Layoutmaster is a thin wrapper around the embedded engine. Public package code in
`src/` should normalize inputs and project engine-authored results. Layout
decisions, geometry, pagination, line breaking, and continuation behavior belong
in `engine/`.

The npm package intentionally ships only `src/`, the built engine in
`engine/dist/`, `README.md`, and `LICENSE`. Keep examples, tests, and design
notes useful in the repository without adding them to the published package
unless the package manifest is updated deliberately.

## Useful Checks

```bash
npm run test:regression
npm run test:performance
npm run pack:check
```

`npm run test:engine-integrity` compares the embedded engine against sibling
VMPrint checkouts and is meant for maintainers with those local repositories
built. It is not required for a normal public clone.
