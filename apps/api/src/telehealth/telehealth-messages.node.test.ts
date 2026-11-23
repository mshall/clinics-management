import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIcs, dueNotifications, telehealthMessageBody, type ReminderState } from "./telehealth-messages";

const H = 3600_000;
const start = new Date("2026-12-10T10:00:00Z");

describe("ADR-039 notification schedule (pure)", () => {
  it("creation sends the link once; the same state sends nothing", () => {
    const first = dueNotifications(new Date(start.getTime() - 3 * 24 * H), { linkVersion: 1, startsAt: start, state: {} });
    assert.deepEqual(first.kinds, ["link"]);
    const again = dueNotifications(new Date(start.getTime() - 3 * 24 * H + 60_000), { linkVersion: 1, startsAt: start, state: first.next });
    assert.deepEqual(again.kinds, []);
  });

  it("24 h and 15 min reminders fire once each, deduped per linkVersion", () => {
    let st: ReminderState = dueNotifications(new Date(start.getTime() - 3 * 24 * H), { linkVersion: 1, startsAt: start, state: {} }).next;
    const r24 = dueNotifications(new Date(start.getTime() - 23.5 * H), { linkVersion: 1, startsAt: start, state: st });
    assert.deepEqual(r24.kinds, ["r24"]);
    st = r24.next;
    assert.deepEqual(dueNotifications(new Date(start.getTime() - 23 * H), { linkVersion: 1, startsAt: start, state: st }).kinds, []);
    const r15 = dueNotifications(new Date(start.getTime() - 14 * 60_000), { linkVersion: 1, startsAt: start, state: st });
    assert.deepEqual(r15.kinds, ["r15"]);
    assert.deepEqual(dueNotifications(new Date(start.getTime() - 12 * 60_000), { linkVersion: 1, startsAt: start, state: r15.next }).kinds, []);
  });

  it("regenerate re-sends the link and re-arms nothing stale; a time edit says 'moved' and re-arms the reminders for the new time", () => {
    let st: ReminderState = dueNotifications(new Date(start.getTime() - 3 * 24 * H), { linkVersion: 1, startsAt: start, state: {} }).next;
    const regen = dueNotifications(new Date(start.getTime() - 2 * 24 * H), { linkVersion: 2, startsAt: start, state: st });
    assert.deepEqual(regen.kinds, ["link"]);
    st = regen.next;
    const newStart = new Date(start.getTime() + 2 * 24 * H);
    const moved = dueNotifications(new Date(start.getTime() - 2 * 24 * H + 60_000), { linkVersion: 2, startsAt: newStart, state: st });
    assert.deepEqual(moved.kinds, ["moved"]);
    assert.equal(moved.next.firstStartsAt, start.toISOString(), "first start is remembered so the page can say 'moved'");
    const r24 = dueNotifications(new Date(newStart.getTime() - 23.5 * H), { linkVersion: 2, startsAt: newStart, state: moved.next });
    assert.deepEqual(r24.kinds, ["r24"]);
  });

  it("a visit created or moved inside 24 h never gets a stale 24 h reminder", () => {
    const soon = new Date(Date.now() + 5 * H);
    const c = dueNotifications(new Date(), { linkVersion: 1, startsAt: soon, state: {} });
    assert.deepEqual(c.kinds, ["link"]);
    assert.deepEqual(dueNotifications(new Date(Date.now() + 60_000), { linkVersion: 1, startsAt: soon, state: c.next }).kinds, []);
  });

  it("bodies are bilingual and carry the link; ics is valid RFC 5545", () => {
    const v = { name: "Sara", clinic: "Kiorly", doctor: "Dr Nadia", time: "Dec 10, 12:00", link: "https://k.example/v/a.b" };
    assert.match(telehealthMessageBody("moved", "en", v), /moved to Dec 10, 12:00/);
    assert.match(telehealthMessageBody("link", "ar", { ...v, name: "سارة" }), /https:\/\/k\.example\/v\/a\.b/);
    const ics = buildIcs({ uid: "s1", startsAt: start, endsAt: new Date(start.getTime() + 30 * 60_000), summary: "Video visit; Dr, Nadia", link: v.link, now: start });
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.includes("DTSTART:20261210T100000Z") && ics.includes(String.raw`SUMMARY:Video visit\; Dr\, Nadia`) && ics.trimEnd().endsWith("END:VCALENDAR"));
  });
});
