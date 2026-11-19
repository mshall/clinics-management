import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyReceptionistIntent,
  clinicalHandoverReplyAr,
} from "./whatsapp-ai-receptionist";

describe("MS-06 WhatsApp AI receptionist intents", () => {
  it("never treats clinical questions as booking — hands over without medical advice", () => {
    const samples = [
      "عندي ألم في الصدر ايه العلاج؟",
      "What medication should I take for fever?",
      "عايز تشخيص للأعراض دي",
      "نصيحة طبية لو سمحت",
    ];
    for (const s of samples) {
      assert.equal(classifyReceptionistIntent(s), "CLINICAL", s);
    }
    const reply = clinicalHandoverReplyAr();
    assert.match(reply, /مش هقدر أدي نصيحة طبية/);
    assert.doesNotMatch(reply, /خد|تناول|prescribe|تشخيصك/i);
  });

  it("classifies booking, prices, location, hours, and staff handover", () => {
    assert.equal(classifyReceptionistIntent("عايز أحجز موعد بكرة"), "BOOKING");
    assert.equal(classifyReceptionistIntent("كام سعر الكشف؟"), "PRICES");
    assert.equal(classifyReceptionistIntent("فين عنوان العيادة؟"), "LOCATION");
    assert.equal(classifyReceptionistIntent("مواعيد العمل ايه؟"), "HOURS");
    assert.equal(classifyReceptionistIntent("كلم موظف بشري"), "HANDOVER");
  });
});
