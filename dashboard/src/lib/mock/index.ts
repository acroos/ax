/**
 * Mock data mode — barrel exports.
 * Enabled by MOCK_DATA=true env var.
 */

export const isMock = process.env.MOCK_DATA === "true";

export { MOCK_USER as mockUser } from "./data";
export { mockFetchAPI, mockApiRoute } from "./router";
