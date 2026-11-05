import { describe, expect, it } from "vitest";
import {
  HistoryNotFoundError,
  PAGE_SIZE,
  getHistoryDetail,
  latestDraft,
  listHistory,
  parseHistoryFilters,
  type HistoryDetail,
  type HistoryQuery,
  type HistoryRepo,
  type HistoryRow,
} from "@/lib/history/service";
import { AuthError } from "@/lib/auth/guards";

const row = (id: string, userId: string, over: Partial<HistoryRow> = {}): HistoryRow => ({
  id,
  createdAt: new Date("2026-11-05T10:00:00Z"),
  userId,
  userName: userId,
  templateSlug: "t",
  templateTitle: "T",
  audience: "INTERNAL",
  reviewed: false,
  reviewedAt: null,
  ...over,
});
const detail = (id: string, userId: string): HistoryDetail => ({
  ...row(id, userId),
  templateVersion: 1,
  model: "mock-1",
  inputs: { a: "b" },
  output: "first",
  refinements: [],
});

function repoOf(rows: HistoryRow[]) {
  const seen: HistoryQuery[] = [];
  const repo: HistoryRepo = {
    list: async (q) => {
      seen.push(q);
      const rs = rows.filter((r) => !q.userId || r.userId === q.userId);
      return { rows: rs, total: rs.length };
    },
    get: async (id) => {
      const r = rows.find((x) => x.id === id);
      return r ? detail(r.id, r.userId) : null;
    },
    templateOptions: async () => [{ slug: "t", title: "T" }],
  };
  return { repo, seen };
}
const s = (role: string, id: string) => ({ user: { id, role } });
const rows = [row("g1", "alice"), row("g2", "bob"), row("g3", "alice")];

describe("parseHistoryFilters", () => {
  it("defaults to page 1 with no filters", () => {
    expect(parseHistoryFilters({})).toEqual({ page: 1 });
  });
  it("reads valid filters", () => {
    expect(
      parseHistoryFilters({
        template: "faq-schema-writer",
        from: "2026-11-01",
        to: "2026-11-05",
        reviewed: "no",
        page: "3",
      }),
    ).toEqual({
      template: "faq-schema-writer",
      from: "2026-11-01",
      to: "2026-11-05",
      reviewed: "no",
      page: 3,
    });
  });
  it("ignores invalid values individually instead of failing", () => {
    expect(
      parseHistoryFilters({ from: "yesterday", to: "2026-11-05", reviewed: "maybe", page: "-4" }),
    ).toEqual({ to: "2026-11-05", page: 1 });
  });
  it("ignores impossible calendar dates (they would otherwise reach the database)", () => {
    expect(parseHistoryFilters({ from: "2026-13-45", to: "2026-02-30" })).toEqual({ page: 1 });
  });
  it("uses the first value of a repeated parameter and ignores blanks", () => {
    expect(parseHistoryFilters({ template: ["a", "b"], from: "  " })).toEqual({
      template: "a",
      page: 1,
    });
  });
});

describe("listHistory visibility", () => {
  it("limits STAFF to their own generations, whatever filters say", async () => {
    const { repo, seen } = repoOf(rows);
    const r = await listHistory(s("STAFF", "alice"), repo, { page: 1 });
    expect(r.scope).toBe("own");
    expect(r.rows.map((x) => x.id)).toEqual(["g1", "g3"]);
    expect(seen[0].userId).toBe("alice");
  });
  it("lets MANAGER and ADMIN see everyone's", async () => {
    for (const role of ["MANAGER", "ADMIN"]) {
      const { repo, seen } = repoOf(rows);
      const r = await listHistory(s(role, "m"), repo, { page: 1 });
      expect(r.scope).toBe("all");
      expect(r.total).toBe(3);
      expect(seen[0].userId).toBeUndefined();
    }
  });
  it("requires a signed-in user", async () => {
    await expect(listHistory(null, repoOf(rows).repo, { page: 1 })).rejects.toBeInstanceOf(
      AuthError,
    );
  });
  it("turns filters into a query: inclusive end date, reviewed flag, page size", async () => {
    const { repo, seen } = repoOf(rows);
    await listHistory(s("ADMIN", "a"), repo, {
      template: "t",
      from: "2026-11-01",
      to: "2026-11-05",
      reviewed: "yes",
      page: 2,
    });
    expect(seen[0]).toEqual({
      userId: undefined,
      templateSlug: "t",
      from: new Date("2026-11-01T00:00:00.000Z"),
      toExclusive: new Date("2026-11-06T00:00:00.000Z"),
      reviewed: true,
      page: 2,
      pageSize: PAGE_SIZE,
    });
  });
  it("computes the page count", async () => {
    const many = Array.from({ length: 45 }, (_, i) => row(`g${i}`, "a"));
    const r = await listHistory(s("ADMIN", "a"), repoOf(many).repo, { page: 1 });
    expect(r.pages).toBe(3);
    const none = await listHistory(s("ADMIN", "a"), repoOf([]).repo, { page: 1 });
    expect(none.pages).toBe(1);
  });
});

describe("getHistoryDetail", () => {
  it("returns your own generation", async () => {
    const d = await getHistoryDetail(s("STAFF", "alice"), repoOf(rows).repo, "g1");
    expect(d.isOwner).toBe(true);
  });
  it("hides someone else's from STAFF as not found", async () => {
    await expect(
      getHistoryDetail(s("STAFF", "alice"), repoOf(rows).repo, "g2"),
    ).rejects.toBeInstanceOf(HistoryNotFoundError);
  });
  it("lets MANAGER and ADMIN open anyone's, flagged as not the owner", async () => {
    const d = await getHistoryDetail(s("MANAGER", "m"), repoOf(rows).repo, "g2");
    expect(d).toMatchObject({ id: "g2", isOwner: false });
  });
  it("reports a missing id as not found", async () => {
    await expect(
      getHistoryDetail(s("ADMIN", "a"), repoOf(rows).repo, "nope"),
    ).rejects.toBeInstanceOf(HistoryNotFoundError);
  });
});

describe("latestDraft", () => {
  it("is the output, or the newest refinement", () => {
    expect(latestDraft({ output: "a", refinements: [] })).toBe("a");
    expect(
      latestDraft({
        output: "a",
        refinements: [
          { id: "1", instruction: "x", output: "b", createdAt: new Date() },
          { id: "2", instruction: "y", output: "c", createdAt: new Date() },
        ],
      }),
    ).toBe("c");
  });
});
