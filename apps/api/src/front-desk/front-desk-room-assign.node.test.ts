import assert from "node:assert/strict";
import test from "node:test";
import { resolveExamRoomLabel } from "./front-desk-room-assign";

const rooms = ["Room 1", "Room 2", "Room 3"];

test("prefers configured preferred room when free", () => {
  const out = resolveExamRoomLabel({
    roomLabels: rooms,
    occupiedLabels: new Set(),
    preferred: "Room 2",
    clinicianDefault: "Room 1",
  });
  assert.equal(out, "Room 2");
});

test("falls back to clinician default then any free room", () => {
  const out = resolveExamRoomLabel({
    roomLabels: rooms,
    occupiedLabels: new Set(["Room 1"]),
    preferred: "Room 1",
    clinicianDefault: "Room 3",
  });
  assert.equal(out, "Room 3");
});