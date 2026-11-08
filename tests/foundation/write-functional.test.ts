import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { defaultPolicy } from "../../src/server/contracts/index.ts";
import { PolicyEngine } from "../../src/server/access/index.ts";
import { authorizedMutation, writeBackendAvailable } from "../../src/server/files/secure-write.ts";
import { approveDelete, listDeleteApprovals, requestDelete, consumeDelete } from "../../src/server/files/delete-approval.ts";

test("M3 denies Write on a Read Only root regardless of sandbox availability", async () => {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),"localdesk-read-only-"));
  try {
    const root=path.join(base,"allowed");
    await fs.mkdir(root);
    const policy=defaultPolicy();
    policy.roots=[{ id:"r", label:"Test", absolutePath:root, enabled:true, access:"read" }];
    policy.tools.write_file=true;
    const engine=await PolicyEngine.create(policy);
    await assert.rejects(
      authorizedMutation(engine,"r",{tool:"write_file",path:"forbidden.txt",content:"blocked"}),
      /read-only|permission|not enabled/i,
    );
    await assert.rejects(fs.stat(path.join(root,"forbidden.txt")));
  } finally { await fs.rm(base,{recursive:true,force:true}); }
});

test("M3 revoked folder and disabled tool reject new mutations", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "localdesk-revoke-"));
  try {
    const root = path.join(base, "approved");
    await fs.mkdir(root);
    const policy = defaultPolicy();
    policy.roots = [{ id: "r", label: "Revocation fixture",
      absolutePath: root, enabled: true, access: "write" }];
    policy.tools.write_file = true;
    const engine = await PolicyEngine.create(policy);
    const disabledTool = engine.snapshot();
    disabledTool.tools.write_file = false;
    await engine.update(disabledTool);
    await assert.rejects(authorizedMutation(engine, "r", {
      tool: "write_file", path: "blocked.txt", content: "blocked",
    }), /not enabled|permission/i);

    const downgraded = engine.snapshot();
    downgraded.tools.write_file = true;
    downgraded.roots[0].access = "read";
    await engine.update(downgraded);
    await assert.rejects(authorizedMutation(engine, "r", {
      tool: "write_file", path: "blocked.txt", content: "blocked",
    }), /read-only|permission/i);
    const revoked = engine.snapshot();
    revoked.roots[0].enabled = false;
    await engine.update(revoked);
    await assert.rejects(authorizedMutation(engine, "r", {
      tool: "write_file", path: "blocked.txt", content: "blocked",
    }), /not enabled/i);
    await assert.rejects(fs.stat(path.join(root, "blocked.txt")));
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("M3 deletion approval is explicit, path-bound, one-time and expires", async () => {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),"localdesk-approval-"));
  const before=process.env.LOCAL_MCP_STATE_DIR;
  process.env.LOCAL_MCP_STATE_DIR=base;
  try {
    const first=await requestDelete("r","docs/to-delete.txt");
    // Consuming an unapproved ticket is a failed attempt that burns the ticket.
    await assert.rejects(consumeDelete("r","docs/to-delete.txt",first.approvalId), /approval required/i);
    await assert.rejects(approveDelete(first.approvalId), /expired|not found/i);

    const second=await requestDelete("r","docs/to-delete.txt");
    await approveDelete(second.approvalId);
    await assert.rejects(consumeDelete("r","docs/wrong.txt",second.approvalId), /approval required/i);
    // A mismatched path also burns its ticket, preventing replay.
    await assert.rejects(consumeDelete("r","docs/to-delete.txt",second.approvalId), /approval required/i);

    const third=await requestDelete("r","docs/to-delete.txt");
    await approveDelete(third.approvalId);
    await consumeDelete("r","docs/to-delete.txt",third.approvalId);
    await assert.rejects(consumeDelete("r","docs/to-delete.txt",third.approvalId), /approval required/i);
  } finally {
    if (before === undefined) delete process.env.LOCAL_MCP_STATE_DIR;
    else process.env.LOCAL_MCP_STATE_DIR=before;
    await fs.rm(base,{recursive:true,force:true});
  }
});

test("M3 delete approval is atomic when simultaneous requests replay one ticket", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "localdesk-delete-race-"));
  const previous = process.env.LOCAL_MCP_STATE_DIR;
  process.env.LOCAL_MCP_STATE_DIR = base;
  try {
    const ticket = await requestDelete("root", "docs/single.txt");
    await approveDelete(ticket.approvalId);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () =>
      consumeDelete("root", "docs/single.txt", ticket.approvalId)));
    assert.equal(results.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(results.filter(value => value.status === "rejected").length, 11);
    await assert.rejects(consumeDelete("root", "docs/single.txt", ticket.approvalId),
      /approval required/i);
    assert.equal((await fs.readdir(path.join(base, "pending-delete")))
      .some(name => name.endsWith(".lock")), false, "Claim lock must be released");
  } finally {
    if (previous === undefined) delete process.env.LOCAL_MCP_STATE_DIR;
    else process.env.LOCAL_MCP_STATE_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("M3 expired delete approvals cannot be confirmed or spent", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "localdesk-delete-expiry-"));
  const previous = process.env.LOCAL_MCP_STATE_DIR;
  process.env.LOCAL_MCP_STATE_DIR = base;
  try {
    const ticket = await requestDelete("root", "docs/expired.txt");
    const filename = path.join(base, "pending-delete", ticket.approvalId + ".json");
    const saved = JSON.parse(await fs.readFile(filename, "utf8")) as Record<string, unknown>;
    await fs.writeFile(filename, JSON.stringify({ ...saved, expiresAt: Date.now() - 1 }));
    await assert.rejects(approveDelete(ticket.approvalId), /expired|not found/i);
    await assert.rejects(consumeDelete("root", "docs/expired.txt", ticket.approvalId),
      /approval required/i);
    assert.equal((await listDeleteApprovals()).length, 0);
  } finally {
    if (previous === undefined) delete process.env.LOCAL_MCP_STATE_DIR;
    else process.env.LOCAL_MCP_STATE_DIR = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("M3 supported worker creates, edits, renames and deletes only within approved folder",
  { skip: !writeBackendAvailable() && "Supported filesystem write worker unavailable; Write remains disabled" },
  async () => {
    const base=await fs.mkdtemp(path.join(os.tmpdir(),"localdesk-write-m3-"));
    const before=process.env.LOCAL_MCP_STATE_DIR;
    process.env.LOCAL_MCP_STATE_DIR=path.join(base,"local-state");
    try {
      const root=path.join(base,"approved");
      const outside=path.join(base,"outside");
      await fs.mkdir(root); await fs.mkdir(outside);
      await fs.writeFile(path.join(outside,"secret.txt"),"untouched");
      const policy=defaultPolicy();
      policy.roots=[{id:"r",label:"Sandbox",absolutePath:root,enabled:true,access:"write"}];
      for (const tool of ["create_directory","write_file","edit_file","rename_file","delete_file"] as const)
        policy.tools[tool]=true;
      const engine=await PolicyEngine.create(policy);
      await authorizedMutation(engine,"r",{tool:"create_directory",path:"docs"});
      await authorizedMutation(engine,"r",{tool:"write_file",path:"docs/example.txt",content:"original"});
      assert.equal(await fs.readFile(path.join(root,"docs/example.txt"),"utf8"),"original");
      await assert.rejects(
        authorizedMutation(engine,"r",{tool:"write_file",path:"docs/example.txt",content:"overwrite"}));
      await assert.rejects(
        authorizedMutation(engine,"r",{tool:"write_file",path:"../outside/secret.txt",content:"unsafe"}));
      await assert.rejects(
        authorizedMutation(engine,"r",{tool:"write_file",path:"/etc/passwd",content:"unsafe"}));
      await assert.rejects(
        authorizedMutation(engine,"r",{tool:"write_file",path:".hidden.txt",content:"unsafe"}));
      await fs.symlink(outside, path.join(root,"external"), process.platform === "win32" ? "junction" : "dir");
      await assert.rejects(
        authorizedMutation(engine,"r",{tool:"write_file",path:"external/new.txt",content:"unsafe"}));
      await fs.link(path.join(outside,"secret.txt"),path.join(root,"hardlink.txt"));
      await assert.rejects(
        authorizedMutation(engine,"r",{tool:"edit_file",path:"hardlink.txt",
          content:"unsafe",expectedSha256:createHash("sha256").update("untouched").digest("hex")}));
      const digest=createHash("sha256").update("original").digest("hex");
      await assert.rejects(authorizedMutation(engine,"r",{
        tool:"edit_file",path:"docs/example.txt",content:"updated",expectedSha256:"0".repeat(64),
      }));
      await authorizedMutation(engine,"r",{
        tool:"edit_file",path:"docs/example.txt",content:"updated",expectedSha256:digest,
      });
      await fs.writeFile(path.join(root,"docs/existing.txt"),"must-stay");
      await assert.rejects(authorizedMutation(engine,"r",{
        tool:"rename_file",path:"docs/example.txt",destination:"docs/existing.txt",
      }));
      assert.equal(await fs.readFile(path.join(root,"docs/existing.txt"),"utf8"),"must-stay");
      await authorizedMutation(engine,"r",{
        tool:"rename_file",path:"docs/example.txt",destination:"docs/renamed.txt",
      });
      const request=await authorizedMutation(engine,"r",{
        tool:"delete_file",path:"docs/renamed.txt",
      }) as {approvalId:string;status:string};
      assert.equal(request.status,"approval_required");
      assert.equal((await listDeleteApprovals()).length,1);
      await approveDelete(request.approvalId);
      await authorizedMutation(engine,"r",{
        tool:"delete_file",path:"docs/renamed.txt",approval:request.approvalId,
      });
      await assert.rejects(fs.stat(path.join(root,"docs/renamed.txt")));
      assert.equal(await fs.readFile(path.join(outside,"secret.txt"),"utf8"),"untouched");
    } finally {
      if (before === undefined) delete process.env.LOCAL_MCP_STATE_DIR;
      else process.env.LOCAL_MCP_STATE_DIR=before;
      await fs.rm(base,{recursive:true,force:true});
    }
  });
