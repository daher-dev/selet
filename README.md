# Selet

Painel de controle da Selet — alimentação saudável, do produtor à sua mesa.
Multi-loja, mobile-first, pt-BR.

**Produção:** https://app.espacoselet.com.br (App Hosting: `selet--selet-prod.us-east4.hosted.app`)

## Stack

- **Next.js 16** (App Router, RSC + Server Actions — sem API separada)
- **Firestore** via `firebase-admin` **somente no servidor** (rules negam todo acesso de cliente)
- **Firebase Auth** (Google) → cookie de sessão httpOnly de 14 dias; allowlist em `users/{email}`
- **Firebase App Hosting** — deploy automático a cada push na `main`
- **Tailwind v4** + shadcn/ui (radix) com tokens da marca; Lucide; Recharts
- Fontes: Cormorant Garamond (display), Albert Sans (UI), JetBrains Mono (números)

## Modelo de dados (multi-tenant)

Tudo escopado por loja em `stores/{storeId}/…` (orders, customers, products,
stockItems, finance). Identidade global em `users/{email}` com papel
(`admin`/`funcionario`), lojas e seções permitidas. Valores monetários em
**centavos inteiros**. O gate de segurança é `requireAccess(storeId, section)`
na primeira linha de toda página e server action ([src/lib/access.ts](src/lib/access.ts)).

## Desenvolvimento

```bash
npm install
npm run emulators      # Firestore + Auth emulators (precisa de Java)
npm run seed           # loja + admin no emulador
npm run dev            # http://localhost:3000
```

`.env.example` → `.env.local` já aponta para os emuladores.

## Testes

```bash
npm run test           # Vitest: unit + componentes + repositórios (emulador)
npm run e2e            # Playwright: fluxo completo em viewport mobile
```

O CI (GitHub Actions) roda lint, typecheck, Vitest e Playwright em todo push/PR.

## Operações

- **Convidar alguém:** Equipe → Novo membro (a pessoa entra com a conta Google do e-mail convidado).
- **Nova loja:** criar doc em `stores/{id}` (name, sub, initial) — via script ou console.
- **Bootstrap de produção (uma vez):** `gcloud auth application-default login && npm run bootstrap:prod`.
- **Regras/índices:** `firebase deploy --only firestore`.

O design de referência (gerado no Claude Design) está em [docs/design](docs/design).
