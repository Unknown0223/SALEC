import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const marker = join(__dirname, ".db-integration-ready");
const dbReady = existsSync(marker) && readFileSync(marker, "utf8").trim() === "1";

const app = buildApp();

describe.skipIf(!dbReady)("staff / agents & supervisors API (database)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /supervisors lists role supervisor", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const res = await request(app.server).get("/api/test1/supervisors").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("PATCH agents/:id accepts only supervisor role; rejects admin as supervisor", async () => {
    const loginResponse = await request(app.server).post("/api/auth/login").send({
      slug: "test1",
      login: "admin",
      password: "secret123"
    });
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.accessToken as string;

    const agentLogin = `agent_sv_${Date.now()}`;
    const createAgent = await request(app.server)
      .post("/api/test1/agents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        first_name: "Agent",
        last_name: "SvTest",
        login: agentLogin,
        password: "secret12"
      });
    expect(createAgent.status).toBe(201);
    const agentId = createAgent.body.id as number;

    const supLogin = `supervisor_sv_${Date.now()}`;
    const createSup = await request(app.server)
      .post("/api/test1/supervisors")
      .set("Authorization", `Bearer ${token}`)
      .send({
        first_name: "Sup",
        last_name: "Test",
        login: supLogin,
        password: "secret12"
      });
    expect(createSup.status).toBe(201);
    const supervisorId = createSup.body.id as number;

    const usersRes = await request(app.server)
      .get("/api/test1/users")
      .set("Authorization", `Bearer ${token}`);
    const adminRow = (usersRes.body.data as Array<{ id: number; login: string }>).find((u) => u.login === "admin");
    expect(adminRow).toBeDefined();
    const adminId = adminRow!.id;

    const rejectAdmin = await request(app.server)
      .patch(`/api/test1/agents/${agentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ supervisor_user_id: adminId });
    expect(rejectAdmin.status).toBe(400);
    expect(rejectAdmin.body.error).toBe("BadSupervisor");

    const setSup = await request(app.server)
      .patch(`/api/test1/agents/${agentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ supervisor_user_id: supervisorId });
    expect(setSup.status).toBe(200);
    expect(setSup.body.supervisor_user_id).toBe(supervisorId);

    const clear = await request(app.server)
      .patch(`/api/test1/agents/${agentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ supervisor_user_id: null });
    expect(clear.status).toBe(200);
    expect(clear.body.supervisor_user_id).toBeNull();
  });
});
