/**
 * TWO rosters:
 *
 *  - INVITES (`seedInvites`) — a FICTIONAL demo roster mirroring the design's
 *    `allTeam` (docs/design/Selet Admin.dc.html:2005). DEMO ONLY: used by the
 *    emulator seed (scripts/seed.ts) so the Equipe page renders a full team for
 *    local review. Never provisioned into production.
 *
 *  - REAL_TEAM (`seedRealTeam`) — the ACTUAL Selet staff, provisioned by the
 *    prod bootstrap (scripts/bootstrap-prod.ts). Members without an email yet
 *    are documented but skipped (fill in the email to provision, or just invite
 *    them in-app via Equipe → Novo membro).
 *
 * The doc id is the lowercased email (mirrors the in-app invite flow in
 * src/data/users.ts). `convidado` members start with no uid and are activated by
 * the /api/session route on their first Google sign-in. Both seeders are
 * idempotent — an already-existing user is left untouched, so re-running never
 * resets someone who has already logged in.
 */
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

interface Invite {
  email: string;
  name: string;
  phone: string;
  role: "admin" | "funcionario";
  storeIds: string[] | "all";
  sections: string[];
  status: "ativo" | "inativo" | "convidado";
  /** When they were invited (design "joined"); omitted → now (fresh invite). */
  joined?: { month: number; year: number };
}

/** First day of the given month, as a Timestamp. */
function monthTs(month: number, year: number): Timestamp {
  return Timestamp.fromDate(new Date(year, month - 1, 1));
}

// Mirrors the design roster. Admins carry no `sections` (full access);
// funcionários carry their granted modules. Stores map to our ids:
// Vila Velha/ES → "vila-velha", Passos/MG → "passos".
export const INVITES: Invite[] = [
  {
    email: "rodrigo@selet.com.br",
    name: "Rodrigo Daher",
    phone: "(27) 99988-1200",
    role: "admin",
    storeIds: "all",
    sections: [],
    status: "ativo",
    joined: { month: 2, year: 2024 },
  },
  {
    email: "marina.alves@selet.com.br",
    name: "Marina Alves",
    phone: "(27) 99655-3341",
    role: "funcionario",
    storeIds: ["vila-velha"],
    sections: ["pedidos", "clientes", "estoque"],
    status: "ativo",
    joined: { month: 3, year: 2024 },
  },
  {
    email: "tiago.nunes@selet.com.br",
    name: "Tiago Nunes",
    phone: "(35) 99720-8890",
    role: "funcionario",
    storeIds: ["passos"],
    sections: ["pedidos"],
    status: "ativo",
    joined: { month: 5, year: 2024 },
  },
  {
    email: "camila.rocha@selet.com.br",
    name: "Camila Rocha",
    phone: "(27) 99512-7788",
    role: "funcionario",
    storeIds: ["vila-velha", "passos"],
    sections: ["pedidos", "clientes", "produtos", "estoque"],
    status: "ativo",
    joined: { month: 6, year: 2024 },
  },
  {
    email: "bruno.teixeira@selet.com.br",
    name: "Bruno Teixeira",
    phone: "(35) 99340-1155",
    role: "funcionario",
    storeIds: ["passos"],
    sections: ["pedidos"],
    status: "convidado",
    // fresh invite — no `joined`, invitedAt defaults to now.
  },
  {
    email: "leticia.moraes@selet.com.br",
    name: "Letícia Moraes",
    phone: "(27) 99201-6644",
    role: "admin",
    storeIds: "all",
    sections: [],
    status: "inativo",
    joined: { month: 1, year: 2024 },
  },
];

export async function seedInvites(db: Firestore): Promise<string[]> {
  const created: string[] = [];
  for (const { joined, ...inv } of INVITES) {
    const email = inv.email.toLowerCase();
    const ref = db.doc(`users/${email}`);
    if ((await ref.get()).exists) continue;
    const invitedAt = joined ? monthTs(joined.month, joined.year) : FieldValue.serverTimestamp();
    await ref.set({
      ...inv,
      email,
      uid: null,
      invitedAt,
      // Members the design shows as onboarded (ativo/inativo) have logged in;
      // convidado members have not, so they get no firstLoginAt.
      ...(inv.status === "convidado" ? {} : { firstLoginAt: invitedAt }),
    });
    created.push(email);
  }
  return created;
}

// ---- REAL team (prod). Distinct from the demo INVITES above. ----

export interface RealMember {
  /** null = email not known yet; the entry is documented but NOT provisioned. */
  email: string | null;
  name: string;
  role: "admin" | "funcionario";
  storeIds: string[] | "all";
  /** Granted modules for funcionários (admins ignore this). */
  sections: string[];
  status: "ativo" | "inativo" | "convidado";
  phone?: string;
}

/**
 * The actual Selet staff, provisioned by scripts/bootstrap-prod.ts. The admin
 * joao@daher.dev is created directly by the bootstrap; the rest live here.
 * Members without an email are skipped until one is added (or invite them
 * in-app via Equipe → Novo membro, which is the normal path).
 */
export const REAL_TEAM: RealMember[] = [
  {
    email: "nasc90324@gmail.com",
    name: "Barbara",
    role: "funcionario",
    storeIds: ["passos"],
    sections: ["pedidos", "clientes", "produtos", "estoque"],
    status: "ativo",
  },
  // Email pending — fill in to provision on the next bootstrap, or invite in-app.
  // Access for Rebecca is a sensible default; adjust in Equipe once she's in.
  {
    email: null,
    name: "Priscilla",
    role: "admin",
    storeIds: "all",
    sections: [],
    status: "convidado",
  },
  {
    email: null,
    name: "Rebecca",
    role: "funcionario",
    storeIds: ["vila-velha"],
    sections: ["pedidos", "clientes", "produtos", "estoque"],
    status: "convidado",
  },
];

/**
 * Provisions the real team. Idempotent (existing users untouched) and safe:
 * members without an email are reported as pending, not created.
 */
export async function seedRealTeam(
  db: Firestore,
): Promise<{ created: string[]; pending: string[] }> {
  const created: string[] = [];
  const pending: string[] = [];
  for (const m of REAL_TEAM) {
    if (!m.email) {
      pending.push(m.name);
      continue;
    }
    const email = m.email.toLowerCase();
    const ref = db.doc(`users/${email}`);
    if ((await ref.get()).exists) continue; // never reset an existing member
    await ref.set({
      email,
      name: m.name,
      role: m.role,
      storeIds: m.storeIds,
      sections: m.sections,
      status: m.status,
      phone: m.phone ?? null,
      uid: null,
      invitedAt: FieldValue.serverTimestamp(),
      ...(m.status === "convidado" ? {} : { firstLoginAt: FieldValue.serverTimestamp() }),
    });
    created.push(email);
  }
  return { created, pending };
}
