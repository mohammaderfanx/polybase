import { describe, expect, it } from "vitest";
import { computeMetrics, proofPayload, signProof, verifyProof } from "@/lib/proof";

const pos = (shares: number, avg: number, cur: number, fees = 0) => ({ shares, avg_buy_price: avg, current_price: cur, realized_pnl: 0, fees_paid: fees, market_title: "m", outcome: "YES", venue: "Kalshi" });

describe("proof-of-P&L", () => {
  it("computes fee-adjusted ROI and win rate", () => {
    const m = computeMetrics([pos(100, 0.4, 0.6, 2), pos(100, 0.5, 0.4)], []);
    expect(m.total_volume_usd).toBe(90);
    expect(m.net_pnl_usd).toBe(8); // +18 − 10
    expect(m.total_roi_pct).toBe(8.89);
    expect(m.win_rate_pct).toBe(50);
  });
  it("signed statement never contains dollar amounts", () => {
    const p = proofPayload("a", computeMetrics([pos(1000, 0.4, 0.6)], []), "2026-01-01");
    expect(p).not.toMatch(/usd|volume|pnl_usd/);
  });
  it("valid signature verifies, tampered statement fails", async () => {
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const priv = await crypto.subtle.exportKey("jwk", kp.privateKey), pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
    const sig = await signProof(priv, '{"roi":5}');
    expect(await verifyProof(pub, '{"roi":5}', sig)).toBe(true);
    expect(await verifyProof(pub, '{"roi":50}', sig)).toBe(false);
  });
});
