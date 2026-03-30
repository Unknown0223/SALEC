"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const app_1 = require("../src/app");
const app = (0, app_1.buildApp)();
(0, vitest_1.describe)("GET /health", () => {
    (0, vitest_1.beforeAll)(async () => {
        await app.ready();
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.it)("returns status ok", async () => {
        const response = await (0, supertest_1.default)(app.server).get("/health");
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body.status).toBe("ok");
        (0, vitest_1.expect)(typeof response.body.time).toBe("string");
    });
});
