import { describe, expect, it } from "vitest";
import { isApproaching } from "./approach";
import type { TrainStop, VTAndamento, WorkerEnv } from "../types";

const NICHELINO = "S01700";
const CANDIOLO = "S01750";

function makeEnv(): WorkerEnv {
  return {
    PL_STATE: {} as KVNamespace,
    TELEGRAM_CHAT_ID: "",
    TELEGRAM_TOKEN: "",
    ADMIN_CHAT_ID: "",
    NICHELINO_CODE: NICHELINO,
    CANDIOLO_CODE: CANDIOLO,
    ACTIVE_HOURS_START: "7",
    ACTIVE_HOURS_END: "21",
    TRAIN_CATEGORIES: "REG,RV",
  };
}

function makeStop(
  id: string,
  effettiva: number | null,
  arrivoReale: number | null = null
): TrainStop {
  return { id, programmata: 1750000000000, effettiva, arrivoReale };
}

function makeAndamento(fermate: TrainStop[]): VTAndamento {
  return {
    numeroTreno: 3041,
    codOrigine: "S00001",
    ritardo: 0,
    subTitle: null,
    fermate,
  };
}

const env = makeEnv();

describe("isApproaching", () => {
  it("returns true when Nichelino passed and Candiolo not yet reached", () => {
    const andamento = makeAndamento([
      makeStop(NICHELINO, 1750000060000), // passed
      makeStop(CANDIOLO, null),           // not yet
    ]);
    expect(isApproaching(andamento, env)).toBe(true);
  });

  it("returns false when both Nichelino and Candiolo are passed (train already gone)", () => {
    const andamento = makeAndamento([
      makeStop(NICHELINO, 1750000060000),
      makeStop(CANDIOLO, 1750000300000),
    ]);
    expect(isApproaching(andamento, env)).toBe(false);
  });

  it("returns false when Nichelino not yet passed (train not arrived)", () => {
    const andamento = makeAndamento([
      makeStop(NICHELINO, null),
      makeStop(CANDIOLO, null),
    ]);
    expect(isApproaching(andamento, env)).toBe(false);
  });

  it("returns false when fermate is empty (no crash)", () => {
    const andamento = makeAndamento([]);
    expect(isApproaching(andamento, env)).toBe(false);
  });

  it("returns false when Nichelino stop is missing from fermate", () => {
    const andamento = makeAndamento([
      makeStop("S99999", 1750000060000),
      makeStop(CANDIOLO, null),
    ]);
    expect(isApproaching(andamento, env)).toBe(false);
  });

  it("returns false when Candiolo stop is missing but Nichelino not passed", () => {
    const andamento = makeAndamento([makeStop(NICHELINO, null)]);
    expect(isApproaching(andamento, env)).toBe(false);
  });

  it("returns true when Nichelino passed and Candiolo stop is missing entirely", () => {
    // Candiolo not in fermate = train hasn't reached it → approaching
    const andamento = makeAndamento([makeStop(NICHELINO, 1750000060000)]);
    expect(isApproaching(andamento, env)).toBe(true);
  });

  it("treats arrivoReale as passed when effettiva is null", () => {
    const andamento = makeAndamento([
      makeStop(NICHELINO, null, 1750000060000), // arrivoReale set, effettiva null
      makeStop(CANDIOLO, null, null),
    ]);
    expect(isApproaching(andamento, env)).toBe(true);
  });

  it("treats arrivoReale on Candiolo as passed (train already gone)", () => {
    const andamento = makeAndamento([
      makeStop(NICHELINO, 1750000060000),
      makeStop(CANDIOLO, null, 1750000300000), // arrivoReale set
    ]);
    expect(isApproaching(andamento, env)).toBe(false);
  });

  it("handles extra stops in fermate without affecting result", () => {
    const andamento = makeAndamento([
      makeStop("S00001", 1749999000000),       // origin — already passed
      makeStop(NICHELINO, 1750000060000),       // passed
      makeStop("S01725", null),                 // intermediate — not reached
      makeStop(CANDIOLO, null),                 // not yet
      makeStop("S01800", null),                 // downstream — not reached
    ]);
    expect(isApproaching(andamento, env)).toBe(true);
  });
});
