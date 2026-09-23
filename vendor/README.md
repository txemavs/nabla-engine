# Desktop dependency snapshot

`nabla-desktop-0cc33a8.tgz` is the MIT-licensed `@nabla/desktop` package built
from [nabla-desktop](https://github.com/txemavs/nabla-desktop) commit
`0cc33a8130ba97dd719517bc9ad828402e6a8be5` (version 0.1.0).
The archive includes the upstream LICENSE and documentation.

SHA-256: `9cea6b555dc8db5755f35206cb02cabb5a3c3625d5eb0593f8984f39a3081032`.

This temporary, version-pinned snapshot makes clean installs reproducible while
Desktop has no published registry release. It is a development dependency for
Studio only; Engine's runtime dependencies and published exports remain independent
of Vue, Pinia and Desktop. Replace it with a pinned registry release when available.

To update, check out the intended upstream commit, run `npm ci`, `npm run build`
and `npm pack`, copy the resulting archive here, update its checksum and provenance,
and run `npm install --save-dev ./vendor/<archive>.tgz` plus the Engine checks.
Do not point the package at a developer's absolute path or a floating branch.
