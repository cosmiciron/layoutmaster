# Layoutmaster Handoff

Use this note when starting a fresh Codex session for Layoutmaster work.

## Context

We renamed/relaunched the former Prelayout project as **Layoutmaster**.
Prelayout can remain online for history and slow star accumulation, but new work
should happen in:

```text
/Users/cosmiciron/Projects/layoutmaster
```

GitHub:

```text
https://github.com/cosmiciron/layoutmaster
```

npm:

```text
@layoutmaster/layoutmaster
```

Live demos:

```text
https://cosmiciron.github.io/layoutmaster/
```

## Current State

- `main` is pushed to `cosmiciron/layoutmaster`.
- npm package `@layoutmaster/layoutmaster@0.1.0` is published.
- GitHub Pages is enabled and deploying from GitHub Actions.
- CI and Pages were green after commit `bbce847 Fix demo import maps`.
- Demo HTML import maps now resolve `@layoutmaster/layoutmaster` through esm.sh.
- Prelayout source repo was left untouched during the sibling-project migration.

## Commands That Passed

```bash
npm run test:regression
npm run test:performance
npm run pack:check
```

Local smoke check used headless Chrome against the dev server and confirmed the
`form` demo rendered actual pieces after the import-map fix.

## Important Gotchas

- The bare npm name `layoutmaster` cannot currently be published because npm
  blocks it as too similar to the existing `layout-master` package.
- Use `@layoutmaster/layoutmaster` in docs, demos, and examples.
- GitHub SSH was not configured locally; HTTPS remote push worked.
- GitHub Pages initially failed until Pages was manually enabled in repo
  settings with source set to GitHub Actions.
- `actions/configure-pages@v5` with `enablement: true` remains in the workflow,
  but manual enablement was still required for the new repo.

## Next Work

1. Update GitHub repo metadata:
   - description
   - website URL
   - topics

2. Add a short Prelayout redirect/deprecation note:
   - README points users to Layoutmaster
   - npm/package migration messaging if desired
   - old demo page can redirect or prominently link to the new demos

3. Continue rebranding copy:
   - sharpen "Layoutmaster" positioning
   - keep the cheeky 1997-tool attitude
   - avoid sterile modern devtool branding

4. Design the official **Doctor DOMless** mascot:
   - original pulp/comic villain energy
   - no Darth Vader, Dr. Doom, or copyrighted likeness
   - armor/cape/render-tree/grid motifs are fair game

5. Audit docs/examples after the scoped package rename:
   - check all install/import snippets
   - check demo CDN import maps
   - check README links and GitHub Pages links

6. Consider package/version housekeeping:
   - decide whether `0.1.1` is needed after docs/demo polish
   - maybe publish a GitHub release for `0.1.0`

## Suggested Opening Prompt

```text
We are now working in /Users/cosmiciron/Projects/layoutmaster, the relaunched
version of the former Prelayout project. The repo is live at
https://github.com/cosmiciron/layoutmaster, npm package
@layoutmaster/layoutmaster@0.1.0 is published, and GitHub Pages demos are live at
https://cosmiciron.github.io/layoutmaster/. Read HANDOFF.md first, then help me
continue the Layoutmaster rebrand: repo metadata, Prelayout redirect/migration
notes, docs polish, and eventually the Doctor DOMless mascot.
```
