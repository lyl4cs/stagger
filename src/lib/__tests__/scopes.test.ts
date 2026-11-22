import { describe, it, expect } from "vitest";
import { hasReplyTracking, SEND_SCOPE, HEADERS_SCOPE } from "../scopes";

describe("hasReplyTracking", () => {
  it("is off for send-only grants and missing data", () => {
    expect(hasReplyTracking(`openid email ${SEND_SCOPE}`)).toBe(false);
    expect(hasReplyTracking(null)).toBe(false);
    expect(hasReplyTracking("")).toBe(false);
  });
  it("is on only when Google granted the headers scope", () => {
    expect(hasReplyTracking(`${SEND_SCOPE} ${HEADERS_SCOPE}`)).toBe(true);
    expect(hasReplyTracking(`${HEADERS_SCOPE}.evil`)).toBe(false); // exact match, not substring
  });
});
