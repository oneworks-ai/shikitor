# Shikitor Agent Guide

Shikitor is a pnpm workspace. `@shikitor/core`, `@shikitor/react`, and
`dsh-shikitor` are public packages; the repository root, playground, and
`standard` package are private development containers and must not be
published.

## Release contract

- Public packages use one coordinated version. Update all workspace package
  versions and `changelog/<version>/readme.md` in a dedicated release PR.
- Core and React keep source-facing `exports` for workspace development. Their
  complete dist-facing package manifest lives in `publishConfig`; every public
  subpath must resolve to a file produced by Jiek and included by `files`.
- Publish with pnpm only. Do not use bare `npm publish`, because npm does not
  apply pnpm's arbitrary `publishConfig` manifest overrides or workspace
  protocol conversion.
- From a clean release revision, run `pnpm release:packages`. The fixed order is
  core, React, then the DSH bundle so downstream package references already
  exist when each package becomes public.
- Before publishing, run the complete Shikitor test suite, build all three
  public packages and the playground, inspect pnpm-generated tarballs, and
  confirm the public-package production audit is clean.
- Freeze one source revision before publication. Create the aggregate release
  tag and package-specific immutable tags from that same revision, then verify
  the npm versions, dist-tags, and GitHub Release assets after publication.
