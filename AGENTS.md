<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI reference — the artifact is the source of truth (hard rule)

The source of truth for the app's UI is this artifact: https://claude.ai/artifact/2QmTQCecbD6byc9X85o9Qf#page-8e38a11cca00

**No UI change ships unless the artifact shows it.** Any change that adds, removes or alters what a user sees or does in a screen (a field, button, dialog, list, badge, copy, a new state) must, in the same working session and **before the commit is pushed**:

1. Read the artifact (Artifact tool, `action: "read"`) before building or changing the screen.
2. Update the matching boards **in place** (publish to the same url; never create a new artifact). Edit an existing board when its state changed; add a new board next to it for a new state or screen, and keep the board title describing what it shows.
3. Mention the artifact version in the commit message body.

Board prefixes by screen: `pedidos-*` (Pedidos, order sheet, add-item picker), `cardapio-*` (Cardápio and the product form), `cartelas-*`, `estoque-*`, `financeiro-*`, `clientes-*`, `sorteios-*`, `shakes-*`, `pudim-*`, `configuracoes-*`, `equipe-*`, `visao-geral-*`, `navegacao-*`. Static mocks also live in `docs/design/` (`Mock *.dc.html`, `Selet Brand Identity.dc.html`, `assets/`).
