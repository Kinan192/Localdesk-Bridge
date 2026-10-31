import test from "node:test";
import assert from "node:assert/strict";
import { preflightCloudflareHostname } from "../../src/server/cloudflare/preflight.ts";

const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345";
const zoneId = "a".repeat(32);
const input = { token, domain: "example.com", subdomain: "mcp", allowedEmail: "owner@example.com" };
const response = (body: unknown, code = 200) => new Response(JSON.stringify(body), {
  status: code, headers: { "Content-Type": "application/json" },
});
function mockCloudflare(records: { id:string;name:string;type:string }[], opts?:{active?:boolean;dnsDenied?:boolean}) {
  const calls:string[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const href=String(url); calls.push(href);
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string,string>)?.Authorization, "Bearer " + token);
    assert.equal(new URL(href).origin, "https://api.cloudflare.com");
    if (href.endsWith("/user/tokens/verify")) return response({ success:true,result:{status:"active"} });
    if (href.includes("/zones?")) return response({
      success:true, result:[{
        id:zoneId,name:"example.com",status:opts?.active===false?"pending":"active",
        account:{id:"b".repeat(32),name:"Example account"},
      }],result_info:{total_pages:1},
    });
    if (href.includes("/dns_records?")) {
      assert.equal(new URL(href).searchParams.get("name"),"mcp.example.com");
      if (opts?.dnsDenied) return response({ success:false },403);
      return response({success:true,result:records,result_info:{total_pages:1}});
    }
    throw new Error("Unexpected Cloudflare endpoint");
  }) as typeof fetch;
  return { fetcher, calls };
}
test("P1B preflight verifies owned zone and rejects occupied hostname", async () => {
  const fake=mockCloudflare([{ id:"record1",name:"mcp.example.com",type:"A" }]);
  const data=await preflightCloudflareHostname(input,fake.fetcher);
  assert.equal(data.preflight.zoneActive,true);
  assert.equal(data.preflight.status,"blocked");
  assert.equal(data.preflight.dnsRecords.length,1);
  assert.equal(data.preflight.accessPolicyChecked,false);
  assert.equal(data.canProvision,false);
  assert.equal(data.credentialStored,false);
  assert.equal(JSON.stringify(data).includes(token),false);
  assert.equal(fake.calls.length,3);
});
test("P1B candidate is not permission to provision and does not mutate", async () => {
  const fake=mockCloudflare([]);
  const data=await preflightCloudflareHostname(input,fake.fetcher);
  assert.equal(data.preflight.hostname,"mcp.example.com");
  assert.equal(data.preflight.status,"candidate");
  assert.equal(data.preflight.tunnelChecked,false);
  assert.equal(data.preflight.note.includes("NOT ready"),true);
  assert.equal(fake.calls.every(url=>url.startsWith("https://api.cloudflare.com/client/v4/")),true);
});
test("P1B fails closed when zone not active, missing permission or invalid input", async () => {
  const inactive=mockCloudflare([],{active:false});
  await assert.rejects(()=>preflightCloudflareHostname(input,inactive.fetcher),/not active/);
  const denied=mockCloudflare([],{dnsDenied:true});
  await assert.rejects(()=>preflightCloudflareHostname(input,denied.fetcher),/Token invalid/);
  await assert.rejects(()=>preflightCloudflareHostname({ ...input, domain:"https://example.com" }),/valid domain|Enter/);
  await assert.rejects(()=>preflightCloudflareHostname({ ...input, endpoint:"https://evil.test" }),/unrecognized|Unrecognized/i);
});
