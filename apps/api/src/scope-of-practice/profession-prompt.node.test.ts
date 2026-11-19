import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Profession } from "@prisma/client";
import { draftNoteFromTranscript } from "../clinic-ai/scribe-stt.provider";
import { EG_PROFESSION_PACK } from "./profession-pack";
import { constrainDraftToScope, professionPromptClause } from "./profession-prompt";

describe("PRSOP04 AI prompts carry the profession", () => {
  it("clause names the profession and lists what is out of scope, in EN and AR; physicians are not restricted from prescribing", () => {
    const physio = professionPromptClause(EG_PROFESSION_PACK, Profession.PHYSIOTHERAPIST, "en");
    assert.match(physio, /physiotherapist/i);
    assert.match(physio, /prescribing/);
    assert.match(physio, /laboratory or radiology/);
    const nurseAr = professionPromptClause(EG_PROFESSION_PACK, Profession.NURSE, "ar");
    assert.match(nurseAr, /ممرض/);
    assert.match(nurseAr, /وصف/);
    const doctor = professionPromptClause(EG_PROFESSION_PACK, Profession.PHYSICIAN, "en");
    assert.doesNotMatch(doctor, /prescribing/);
    assert.equal(professionPromptClause(EG_PROFESSION_PACK, null, "en"), "");
  });

  it("the clause follows the market pack (a pack that lets physios order labs drops that restriction)", () => {
    const pack = JSON.parse(JSON.stringify(EG_PROFESSION_PACK));
    pack.scope.PHYSIOTHERAPIST.push("orders.lab_radiology");
    assert.doesNotMatch(professionPromptClause(pack, Profession.PHYSIOTHERAPIST, "en"), /laboratory or radiology/);
  });

  it("scribe draft for a physiotherapist never carries drugs or lab/imaging orders; physician draft is untouched", () => {
    const draft = draftNoteFromTranscript("belly pain since yesterday");
    assert.ok(draft.medications.length > 0 && /PPI/.test(draft.plan));
    const physio = constrainDraftToScope(draft, EG_PROFESSION_PACK, Profession.PHYSIOTHERAPIST);
    assert.deepEqual(physio.medications, []);
    assert.doesNotMatch(physio.plan, /PPI|Labs|ultrasound/i);
    assert.match(physio.localeNote, /scope of practice/);
    const nurse = constrainDraftToScope(draft, EG_PROFESSION_PACK, Profession.NURSE);
    assert.deepEqual(nurse.medications, []);
    assert.deepEqual(constrainDraftToScope(draft, EG_PROFESSION_PACK, Profession.PHYSICIAN), draft);
    assert.deepEqual(constrainDraftToScope(draft, EG_PROFESSION_PACK, null), draft);
  });
});
