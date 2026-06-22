import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VTAndamento, VTPartenza, WorkerEnv } from "./types";

// ---------------------------------------------------------------------------
// Module mocks — declared before imports so vi.mock hoisting works
// ---------------------------------------------------------------------------

vi.mock("./api/viaggiatreno", () => ({
  fetchPartenze: vi.fn(),
  fetchAndamentoTreno: vi.fn(),
}));

vi.mock("./detector/approach", () => ({
  isApproaching: vi.fn(),
}));

vi.mock("./notifier/telegram", () => ({
  sendTelegram: vi.fn(),
}));

vi.mock("./state/pl-state", () => ({
  readState: vi.fn(),
  writeState: vi.fn(),
  incrementErrorCount: vi.fn(),
  resetErrorCount: vi.fn(),
  isPaused: vi.fn().mockResolvedValue(false),
  setPaused: vi.fn(),
  writeLastSuccess: vi.fn(),
  readLastSuccess: vi.fn().mockResolvedValue(null),
  readConfig: vi.fn().mockResolvedValue(null),
  writeConfig: vi.fn().mockResolvedValue(undefined),
  CONFIG_KEYS: ["write_interval"],
}));

vi.mock("./utils/timezone", () => ({
  getRomeMidnightMs: vi.fn().mockReturnValue(1750000000000),
  isActiveHour: vi.fn().mockReturnValue(true),
}));

import { fetchAndamentoTreno, fetchPartenze } from "./api/viaggiatreno";
import { isApproaching } from "./detector/approach";
import { sendTelegram } from "./notifier/telegram";
import {
  incrementErrorCount,
  readState,
  resetErrorCount,
  writeState,
} from "./state/pl-state";
import { isActiveHour } from "./utils/timezone";
import handler from "./index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnv(): WorkerEnv {
  return {
    PL_STATE: {} as KVNamespace,
    TELEGRAM_CHAT_ID: "-100123",
    TELEGRAM_TOKEN: "token",
    ADMIN_CHAT_ID: "admin",
    NICHELINO_CODE: "S01700",
    CANDIOLO_CODE: "S01750",
    ACTIVE_HOURS_START: "7",
    ACTIVE_HOURS_END: "21",
    TRAIN_CATEGORIES: "REG,RV",
  };
}

const fakeTrain: VTPartenza = {
  numeroTreno: 3041,
  categoria: "REG",
  codOrigine: "S00001",
  subTitle: "PINEROLO",
  orarioPartenza: 1750000000000,
};

const fakeAndamento: VTAndamento = {
  numeroTreno: 3041,
  codOrigine: "S00001",
  ritardo: 0,
  subTitle: null,
  fermate: [],
};

function runScheduled(env: WorkerEnv): Promise<void> {
  return handler.scheduled(
    {} as ScheduledEvent,
    env,
    {} as ExecutionContext
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(fetchPartenze).mockResolvedValue([fakeTrain]);
  vi.mocked(fetchAndamentoTreno).mockResolvedValue(fakeAndamento);
  vi.mocked(writeState).mockResolvedValue(undefined);
  vi.mocked(sendTelegram).mockResolvedValue(undefined);
  vi.mocked(resetErrorCount).mockResolvedValue(undefined);
  vi.mocked(incrementErrorCount).mockResolvedValue(1);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("scheduled handler — state transitions", () => {
  it("sends ⚠️ and writes CLOSED when approaching and state is OPEN", async () => {
    vi.mocked(isApproaching).mockReturnValue(true);
    vi.mocked(readState).mockResolvedValue("OPEN");

    await runScheduled(makeEnv());

    expect(writeState).toHaveBeenCalledWith(expect.anything(), "CLOSED", 900);
    expect(sendTelegram).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("⚠️")
    );
  });

  it("sends ⚠️ and writes CLOSED when approaching and state is null (first run)", async () => {
    vi.mocked(isApproaching).mockReturnValue(true);
    vi.mocked(readState).mockResolvedValue(null);

    await runScheduled(makeEnv());

    expect(writeState).toHaveBeenCalledWith(expect.anything(), "CLOSED", 900);
    expect(sendTelegram).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("⚠️")
    );
  });

  it("sends ✅ and writes OPEN when not approaching and state is CLOSED", async () => {
    vi.mocked(isApproaching).mockReturnValue(false);
    vi.mocked(readState).mockResolvedValue("CLOSED");

    await runScheduled(makeEnv());

    expect(writeState).toHaveBeenCalledWith(expect.anything(), "OPEN", 900);
    expect(sendTelegram).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("✅")
    );
  });

  it("sends no Telegram when approaching and state is already CLOSED (no duplicate)", async () => {
    vi.mocked(isApproaching).mockReturnValue(true);
    vi.mocked(readState).mockResolvedValue("CLOSED");

    await runScheduled(makeEnv());

    expect(sendTelegram).not.toHaveBeenCalled();
    expect(writeState).not.toHaveBeenCalled();
  });

  it("sends no Telegram when not approaching and state is OPEN (no duplicate)", async () => {
    vi.mocked(isApproaching).mockReturnValue(false);
    vi.mocked(readState).mockResolvedValue("OPEN");

    await runScheduled(makeEnv());

    expect(sendTelegram).not.toHaveBeenCalled();
    expect(writeState).not.toHaveBeenCalled();
  });

  it("sends no Telegram when not approaching and state is null", async () => {
    vi.mocked(isApproaching).mockReturnValue(false);
    vi.mocked(readState).mockResolvedValue(null);

    await runScheduled(makeEnv());

    expect(sendTelegram).not.toHaveBeenCalled();
  });
});

describe("scheduled handler — active hours gate", () => {
  it("exits early without calling fetchPartenze when outside active hours", async () => {
    vi.mocked(isActiveHour).mockReturnValue(false);

    await runScheduled(makeEnv());

    expect(fetchPartenze).not.toHaveBeenCalled();
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("proceeds normally when inside active hours", async () => {
    vi.mocked(isActiveHour).mockReturnValue(true);
    vi.mocked(isApproaching).mockReturnValue(false);
    vi.mocked(readState).mockResolvedValue("OPEN");

    await runScheduled(makeEnv());

    expect(fetchPartenze).toHaveBeenCalled();
  });
});

describe("scheduled handler — API wiring", () => {
  it("calls fetchPartenze with NICHELINO_CODE", async () => {
    vi.mocked(isApproaching).mockReturnValue(false);
    vi.mocked(readState).mockResolvedValue("OPEN");
    const env = makeEnv();

    await runScheduled(env);

    expect(fetchPartenze).toHaveBeenCalledWith(env.NICHELINO_CODE, env);
  });

  it("calls fetchAndamentoTreno with codOrigine, numeroTreno, midnight ms", async () => {
    vi.mocked(isApproaching).mockReturnValue(false);
    vi.mocked(readState).mockResolvedValue("OPEN");

    await runScheduled(makeEnv());

    expect(fetchAndamentoTreno).toHaveBeenCalledWith(
      fakeTrain.codOrigine,
      fakeTrain.numeroTreno,
      1750000000000,
      makeEnv()
    );
  });

  it("skips processing when no trains returned", async () => {
    vi.mocked(fetchPartenze).mockResolvedValue([]);
    vi.mocked(isApproaching).mockReturnValue(false);
    vi.mocked(readState).mockResolvedValue("OPEN");

    await runScheduled(makeEnv());

    expect(fetchAndamentoTreno).not.toHaveBeenCalled();
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("calls resetErrorCount after a successful cycle", async () => {
    vi.mocked(isApproaching).mockReturnValue(false);
    vi.mocked(readState).mockResolvedValue("OPEN");

    await runScheduled(makeEnv());

    expect(resetErrorCount).toHaveBeenCalledOnce();
    expect(incrementErrorCount).not.toHaveBeenCalled();
  });
});

describe("scheduled handler — error self-notification", () => {
  it("calls incrementErrorCount when fetchPartenze throws", async () => {
    vi.mocked(fetchPartenze).mockRejectedValue(new Error("API 403"));
    vi.mocked(incrementErrorCount).mockResolvedValue(1);

    await runScheduled(makeEnv());

    expect(incrementErrorCount).toHaveBeenCalledOnce();
    expect(resetErrorCount).not.toHaveBeenCalled();
  });

  it("does NOT send admin alert on first error (count < 3)", async () => {
    vi.mocked(fetchPartenze).mockRejectedValue(new Error("API error"));
    vi.mocked(incrementErrorCount).mockResolvedValue(1);

    await runScheduled(makeEnv());

    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("does NOT send admin alert on second error (count < 3)", async () => {
    vi.mocked(fetchPartenze).mockRejectedValue(new Error("API error"));
    vi.mocked(incrementErrorCount).mockResolvedValue(2);

    await runScheduled(makeEnv());

    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("sends admin alert on 3rd consecutive error", async () => {
    vi.mocked(fetchPartenze).mockRejectedValue(new Error("API error"));
    vi.mocked(incrementErrorCount).mockResolvedValue(3);

    await runScheduled(makeEnv());

    expect(sendTelegram).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("🔴"),
      makeEnv().ADMIN_CHAT_ID
    );
    expect(sendTelegram).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("#3"),
      expect.anything()
    );
  });

  it("sends admin alert on 4th+ consecutive error", async () => {
    vi.mocked(fetchPartenze).mockRejectedValue(new Error("API error"));
    vi.mocked(incrementErrorCount).mockResolvedValue(7);

    await runScheduled(makeEnv());

    expect(sendTelegram).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("🔴"),
      makeEnv().ADMIN_CHAT_ID
    );
  });

  it("does not throw even if sendTelegram admin alert fails", async () => {
    vi.mocked(fetchPartenze).mockRejectedValue(new Error("API error"));
    vi.mocked(incrementErrorCount).mockResolvedValue(3);
    vi.mocked(sendTelegram).mockRejectedValue(new Error("Telegram 429"));

    // Handler should NOT propagate the error
    await expect(runScheduled(makeEnv())).resolves.toBeUndefined();
  });
});

describe("scheduled handler — multi-train", () => {
  it("processes each train independently (first triggers transition, second skips)", async () => {
    const train2: VTPartenza = { ...fakeTrain, numeroTreno: 3042 };
    vi.mocked(fetchPartenze).mockResolvedValue([fakeTrain, train2]);
    vi.mocked(fetchAndamentoTreno).mockResolvedValue(fakeAndamento);
    vi.mocked(isApproaching).mockReturnValue(true);

    // First read: OPEN → triggers CLOSED; second read: CLOSED → no duplicate
    vi.mocked(readState)
      .mockResolvedValueOnce("OPEN")
      .mockResolvedValueOnce("CLOSED");

    await runScheduled(makeEnv());

    expect(sendTelegram).toHaveBeenCalledTimes(1);
    expect(writeState).toHaveBeenCalledTimes(1);
  });
});
