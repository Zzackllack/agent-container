# Brand marks

Vendor artwork in `marks.tsx` is copied from each product's own repository or
from simple-icons so the dashboard shows the real logo instead of a lookalike.
None of it is redistributed under this project's licence:

| Mark | Source | Licence |
| --- | --- | --- |
| `T3CodeMark` | `assets/prod/logo.svg` from [pingdotgg/t3code](https://github.com/pingdotgg/t3code) | MIT, © T3 Tools Inc. |
| `OpenCodeMark` | `packages/ui/src/assets/favicon/favicon.svg` from [anomalyco/opencode](https://github.com/anomalyco/opencode) | MIT |
| `CodexMark` | OpenAI mark from [simple-icons](https://github.com/simple-icons/simple-icons) | CC0 1.0 |
| `GitHubMark`, `CloudflareMark`, `NodeMark`, `GoMark`, `RustMark`, `JavaMark`, `MavenMark`, `DockerMark`, `UvMark` | [simple-icons](https://github.com/simple-icons/simple-icons) (`icons/`) | CC0 1.0 |

Rules when touching these files:

- Re-copy from upstream instead of redrawing when a vendor restyles its logo.
- Keep the two path conventions apart: glyph-only artwork (Codex, GitHub,
  Node.js, and the other toolchain marks) must keep `fill="currentColor"` so
  the chip can tint it, while vendor tiles keep their own colours.
- Brand tints live in `styles/agents.css` as `.mark--<id>` rules. Use
  `light-dark()` for a tint that would disappear on one of the two themes
  (Rust is near-black, for example).
- All marks stay decorative (`aria-hidden`); the visible label carries the name
  for screen readers.
