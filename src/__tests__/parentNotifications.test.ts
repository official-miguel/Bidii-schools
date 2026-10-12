/**
 * notifyParents / notifyAllParents: one row per parent (a shared dedupKey once
 * meant a child's second parent was never notified), a push only for rows that
 * are actually new, and no double alert for events already recorded under the
 * old un-suffixed key.
 */

const mockPrisma = {
  parentStudent: { findMany: jest.fn() },
  parent: { findMany: jest.fn() },
  parentNotification: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
};
const mockSendPushToUsers = jest.fn();

jest.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/push", () => ({ sendPushToUsers: (...args: unknown[]) => mockSendPushToUsers(...args) }));

import { notifyParents, notifyAllParents } from "@/lib/parentNotifications";

const duplicate = () => Object.assign(new Error("Unique constraint"), { code: "P2002" });

const base = {
  schoolId: "school-1",
  studentId: "student-1",
  module: "FEES",
  priority: "NORMAL" as const,
  title: "Fee Invoice",
  body: "A new invoice has been issued.",
};

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.parentStudent.findMany.mockResolvedValue([
    { parent: { id: "mum", userId: "user-mum" } },
    { parent: { id: "dad", userId: "user-dad" } },
  ]);
  mockPrisma.parentNotification.findMany.mockResolvedValue([]);
  mockPrisma.parentNotification.create.mockResolvedValue({});
  mockPrisma.parentNotification.update.mockResolvedValue({});
  mockSendPushToUsers.mockResolvedValue(undefined);
});

describe("notifyParents", () => {
  it("gives every linked parent their own row and push", async () => {
    await notifyParents({ ...base, dedupKey: "invoice-7" });

    const keys = mockPrisma.parentNotification.create.mock.calls.map(([arg]) => arg.data.dedupKey);
    expect(keys).toEqual(["invoice-7:mum", "invoice-7:dad"]);
    expect(mockSendPushToUsers).toHaveBeenCalledWith(
      ["user-mum", "user-dad"],
      expect.objectContaining({ title: "Fee Invoice", href: "/parent/fees", tag: "invoice-7" })
    );
  });

  it("refreshes a repeated event's text without pushing again", async () => {
    mockPrisma.parentNotification.create.mockRejectedValueOnce(duplicate());

    await notifyParents({ ...base, dedupKey: "invoice-7" });

    expect(mockPrisma.parentNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId_dedupKey: { schoolId: "school-1", dedupKey: "invoice-7:mum" } } })
    );
    expect(mockSendPushToUsers).toHaveBeenCalledWith(["user-dad"], expect.anything());
  });

  it("skips a parent already notified under the legacy shared key", async () => {
    mockPrisma.parentNotification.findMany.mockResolvedValue([{ parentId: "mum" }]);

    await notifyParents({ ...base, dedupKey: "invoice-7" });

    expect(mockPrisma.parentNotification.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.parentNotification.create.mock.calls[0][0].data.parentId).toBe("dad");
    expect(mockSendPushToUsers).toHaveBeenCalledWith(["user-dad"], expect.anything());
  });

  it("still notifies the other parents when one write fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.parentNotification.create.mockRejectedValueOnce(new Error("connection reset"));

    await expect(notifyParents({ ...base, dedupKey: "invoice-7" })).resolves.toBeUndefined();

    expect(mockSendPushToUsers).toHaveBeenCalledWith(["user-dad"], expect.anything());
  });

  it("creates fresh rows with no dedupKey", async () => {
    await notifyParents(base);

    expect(mockPrisma.parentNotification.findMany).not.toHaveBeenCalled();
    const keys = mockPrisma.parentNotification.create.mock.calls.map(([arg]) => arg.data.dedupKey);
    expect(keys).toEqual([null, null]);
  });

  it("never throws, even when the lookup fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.parentStudent.findMany.mockRejectedValue(new Error("db down"));

    await expect(notifyParents(base)).resolves.toBeUndefined();
    expect(mockSendPushToUsers).not.toHaveBeenCalled();
  });
});

describe("notifyAllParents", () => {
  it("keeps an existing row untouched and pushes only to newly notified parents", async () => {
    mockPrisma.parent.findMany.mockResolvedValue([
      { id: "p1", userId: "u1" },
      { id: "p2", userId: "u2" },
    ]);
    mockPrisma.parentNotification.create.mockRejectedValueOnce(duplicate());

    const { studentId: _unused, ...params } = base;
    const count = await notifyAllParents({ ...params, module: "CALENDAR", dedupKey: "cal-1" });

    expect(count).toBe(2);
    expect(mockPrisma.parentNotification.update).not.toHaveBeenCalled();
    expect(mockSendPushToUsers).toHaveBeenCalledWith(
      ["u2"],
      expect.objectContaining({ href: "/parent/calendar" })
    );
  });
});
