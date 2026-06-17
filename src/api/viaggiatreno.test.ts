import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAndamentoTreno, fetchPartenze } from "./viaggiatreno";
import type { VTAndamento, VTPartenza, WorkerEnv } from "../types";

function makeEnv(categories = "REG,RV"): WorkerEnv {
  return {
    PL_STATE: {} as KVNamespace,
    TELEGRAM_CHAT_ID: "",
    TELEGRAM_TOKEN: "",
    ADMIN_CHAT_ID: "",
    NICHELINO_CODE: "S01700",
    CANDIOLO_CODE: "S01750",
    ACTIVE_HOURS_START: "7",
    ACTIVE_HOURS_END: "21",
    TRAIN_CATEGORIES: categories,
  };
}

function mockFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
  );
}

function mockFetchBadJson(status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    })
  );
}

function mockFetchNetworkError(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-16T10:00:00Z"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// fetchPartenze
// ---------------------------------------------------------------------------

describe("fetchPartenze", () => {
  const rawDepartures: VTPartenza[] = [
    {
      numeroTreno: 3041,
      categoria: "REG",
      codOrigine: "S01700",
      subTitle: "PINEROLO",
      orarioPartenza: 1750000000000,
    },
    {
      numeroTreno: 9601,
      categoria: "FR",
      codOrigine: "S01700",
      subTitle: "MILANO CENTRALE",
      orarioPartenza: 1750000001000,
    },
    {
      numeroTreno: 22301,
      categoria: "RV",
      codOrigine: "S01700",
      subTitle: null,
      orarioPartenza: 1750000002000,
    },
  ];

  it("returns only REG and RV trains (filters out FR)", async () => {
    mockFetch(rawDepartures);
    const result = await fetchPartenze("S01700", makeEnv("REG,RV"));
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.categoria)).toEqual(["REG", "RV"]);
  });

  it("respects custom TRAIN_CATEGORIES", async () => {
    mockFetch(rawDepartures);
    const result = await fetchPartenze("S01700", makeEnv("FR"));
    expect(result).toHaveLength(1);
    expect(result[0].categoria).toBe("FR");
  });

  it("handles nullable subTitle without TypeError", async () => {
    mockFetch(rawDepartures);
    const result = await fetchPartenze("S01700", makeEnv("RV"));
    expect(result[0].subTitle).toBeNull();
  });

  it("calls correct base URL", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [] as VTPartenza[],
    });
    vi.stubGlobal("fetch", spy);
    await fetchPartenze("S01700", makeEnv());
    const calledUrl: string = spy.mock.calls[0][0] as string;
    expect(calledUrl).toContain(
      "http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/partenze/S01700/"
    );
  });

  it("throws typed Error on HTTP 403", async () => {
    mockFetch({}, 403);
    await expect(fetchPartenze("S01700", makeEnv())).rejects.toThrow(
      "ViaggiaTreno HTTP 403"
    );
  });

  it("throws typed Error on non-JSON response", async () => {
    mockFetchBadJson(200);
    await expect(fetchPartenze("S01700", makeEnv())).rejects.toThrow(
      "ViaggiaTreno parse error"
    );
  });

  it("throws typed Error on network failure", async () => {
    mockFetchNetworkError();
    await expect(fetchPartenze("S01700", makeEnv())).rejects.toThrow(
      "ViaggiaTreno network error"
    );
  });

  it("returns empty array when all trains are filtered out", async () => {
    mockFetch(rawDepartures);
    const result = await fetchPartenze("S01700", makeEnv("IC"));
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// fetchAndamentoTreno
// ---------------------------------------------------------------------------

describe("fetchAndamentoTreno", () => {
  const mockAndamento: VTAndamento = {
    numeroTreno: 3041,
    codOrigine: "S01700",
    ritardo: 2,
    subTitle: null,
    fermate: [
      {
        id: "S01700",
        programmata: 1750000000000,
        effettiva: 1750000060000,
        arrivoReale: null,
      },
      {
        id: "S01750",
        programmata: 1750000300000,
        effettiva: null,
        arrivoReale: null,
      },
    ],
  };

  it("returns VTAndamento with fermate array", async () => {
    mockFetch(mockAndamento);
    const result = await fetchAndamentoTreno("S01700", 3041, 1750000000000);
    expect(result.numeroTreno).toBe(3041);
    expect(result.fermate).toHaveLength(2);
  });

  it("handles effettiva null without TypeError", async () => {
    mockFetch(mockAndamento);
    const result = await fetchAndamentoTreno("S01700", 3041, 1750000000000);
    expect(result.fermate[1].effettiva).toBeNull();
  });

  it("handles arrivoReale null without TypeError", async () => {
    mockFetch(mockAndamento);
    const result = await fetchAndamentoTreno("S01700", 3041, 1750000000000);
    expect(result.fermate[0].arrivoReale).toBeNull();
  });

  it("handles nullable subTitle without TypeError", async () => {
    mockFetch(mockAndamento);
    const result = await fetchAndamentoTreno("S01700", 3041, 1750000000000);
    expect(result.subTitle).toBeNull();
  });

  it("constructs correct URL with originCode/trainNumber/departureDateMs", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockAndamento,
    });
    vi.stubGlobal("fetch", spy);
    await fetchAndamentoTreno("S01700", 3041, 1750000000000);
    expect(spy.mock.calls[0][0]).toBe(
      "http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/andamentoTreno/S01700/3041/1750000000000"
    );
  });

  it("throws typed Error on HTTP 403", async () => {
    mockFetch({}, 403);
    await expect(
      fetchAndamentoTreno("S01700", 3041, 1750000000000)
    ).rejects.toThrow("ViaggiaTreno HTTP 403");
  });

  it("throws typed Error on non-JSON response", async () => {
    mockFetchBadJson(200);
    await expect(
      fetchAndamentoTreno("S01700", 3041, 1750000000000)
    ).rejects.toThrow("ViaggiaTreno parse error");
  });
});
