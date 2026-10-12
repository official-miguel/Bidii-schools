/**
 * fetchJsonCached keeps class/subject/staff lists available offline, and —
 * the regression it fixes — never throws, so a failed side request can no
 * longer discard the cached student roster and leave offline search empty.
 */
import { fetchJsonCached, CACHED_JSON_PREFIX } from "@/lib/offline/cachedJson";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const ok = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

describe("fetchJsonCached", () => {
  it("returns the live response and remembers it", async () => {
    mockFetch.mockResolvedValue(ok([{ id: "c1", name: "Grade 7 East" }]));

    await expect(fetchJsonCached("/api/classes", [])).resolves.toEqual([{ id: "c1", name: "Grade 7 East" }]);
    expect(JSON.parse(localStorage.getItem(CACHED_JSON_PREFIX + "/api/classes")!)).toHaveLength(1);
  });

  it("serves the last good response when offline", async () => {
    mockFetch.mockResolvedValueOnce(ok([{ id: "c1" }]));
    await fetchJsonCached("/api/classes", []);

    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchJsonCached("/api/classes", [])).resolves.toEqual([{ id: "c1" }]);
  });

  it("falls back instead of throwing when offline with nothing cached", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchJsonCached("/api/subjects", [])).resolves.toEqual([]);
  });

  it("does not mask a real server refusal with stale data", async () => {
    mockFetch.mockResolvedValueOnce(ok([{ id: "s1" }]));
    await fetchJsonCached("/api/staff", []);

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Forbidden" }) });
    await expect(fetchJsonCached("/api/staff", [])).resolves.toEqual([]);
  });
});
