import { describe, expect, it } from "vitest";
import { formatPp, formatShare, formatTimes } from "./format";

describe("nye formater", () => {
  it("ganger vanlig, rate og prosentpoeng med to desimaler", () => {
    expect(formatTimes(1.309)).toBe("1,31");
    expect(formatShare(0.0156)).toBe("1,56 %");
    expect(formatShare(null)).toBe("–");
    expect(formatPp(0.0087)).toBe("+0,87 pp");
    expect(formatPp(-0.0002)).toBe("−0,02 pp");
  });
});
