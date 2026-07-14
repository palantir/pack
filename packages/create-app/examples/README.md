# create-app examples

These are **generated reference outputs** of `@palantir/pack.create-app`, one per
built-in template. They exist so you can see exactly what each template produces
without running the CLI yourself.

- `schema/` — output of the `schema` template.
- `workspace/` — output of the `workspace` template.

## Important

- Do **not** hand-edit these directories — they are overwritten on regeneration.
- They are intentionally **outside the pnpm workspace**, so the monorepo never
  builds, lints, tests, or type-checks them.
- They are generated with `--skip-install`, so they contain no `node_modules`.

## Regenerating

The generated inputs live in `template-config.json`. To regenerate after changing
the templates or the config:

```bash
# from the repo root
pnpm turbo run build --filter=@palantir/pack.create-app
node packages/create-app/examples/generate.mjs
```
