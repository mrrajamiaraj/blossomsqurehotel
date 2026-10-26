import { describe, expect, it } from "vitest";
import { addDays, dayOrdinal, formatRange, formatShort, isISODate, nightsBetween } from "@/lib/dates";
import { guestsLabel, parseStay } from "@/lib/stay";

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("counts nights", () => {
    expect(nightsBetween("2026-12-12", "2026-12-15")).toBe(3);
  });

  it("formats ranges compactly", () => {
    expect(formatRange("2026-12-12", "2026-12-15")).toBe("12 – 15 Dec 2026");
    expect(formatRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
    expect(formatShort("2026-12-12")).toBe("Sat, 12 Dec");
  });

  it("validates ISO dates", () => {
    expect(isISODate("2026-12-12")).toBe(true);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("12/12/2026")).toBe(false);
  });

  it("writes ordinals", () => {
    expect(["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-11", "2026-12-22"].map(dayOrdinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "11th",
      "22nd",
    ]);
  });
});

describe("parseStay", () => {
  const today = "2026-11-01";

  it("defaults to tomorrow for three nights", () => {
    expect(parseStay({}, today)).toEqual({ checkIn: "2026-11-02", checkOut: "2026-11-05", adults: 2, children: 0, rooms: 1 });
  });

  it("repairs past and inverted dates", () => {
    const s = parseStay({ checkIn: "2026-10-01", checkOut: "2026-09-01" }, today);
    expect(s.checkIn).toBe("2026-11-02");
    expect(nightsBetween(s.checkIn, s.checkOut)).toBe(3);
  });

  it("caps guests to what the rooms hold", () => {
    const s = parseStay({ adults: "9", children: "4", rooms: "2" }, today);
    expect(s).toMatchObject({ adults: 4, children: 2, rooms: 2 });
  });

  it("labels guests", () => {
    expect(guestsLabel({ adults: 2, children: 1, rooms: 2 })).toBe("2 adults, 1 child, 2 rooms");
  });
});
