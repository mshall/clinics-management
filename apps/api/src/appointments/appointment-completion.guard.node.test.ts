import assert from "node:assert/strict";
import test from "node:test";
import { EncounterStatus } from "@prisma/client";
import { assertNoOpenEncounterForAppointmentComplete } from "./appointment-completion.guard";

test("throws when a draft encounter is linked", async () => {
  const db = {
    encounter: {
      findFirst: async () => ({ id: "enc-1" }),
    },
  };
  await assert.rejects(
    () => assertNoOpenEncounterForAppointmentComplete(db as never, "t1", "apt-1"),
    /Finalize the linked encounter/,
  );
});

test("passes when no open encounter", async () => {
  const db = {
    encounter: {
      findFirst: async () => null,
    },
  };
  await assertNoOpenEncounterForAppointmentComplete(db as never, "t1", "apt-1");
});

test("queries draft and amended statuses", async () => {
  let where: unknown;
  const db = {
    encounter: {
      findFirst: async (args: { where: unknown }) => {
        where = args.where;
        return null;
      },
    },
  };
  await assertNoOpenEncounterForAppointmentComplete(db as never, "t1", "apt-1");
  assert.deepEqual((where as { status: { in: EncounterStatus[] } }).status.in, [
    EncounterStatus.DRAFT,
    EncounterStatus.AMENDED,
  ]);
});