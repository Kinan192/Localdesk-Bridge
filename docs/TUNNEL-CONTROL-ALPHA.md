# Cloudflare Tunnel process control — developer alpha

**Date:** 2026-10-30. **Audit status:** source updated, new host audit required. Real-case test showed dashboard **Managed Tunnel process: error, PID: —** while Cloudflare tunnel reportedly **Healthy**: this is NOT evidence that dashboard started a child. Previous generic error hid the failing step. Source now accepts padded standard Base64 Tunnel tokens, and reports safe failure stages (`tunnel-lookup`, `connector-token`, `token-format`, `cloudflared-launch`, `cloudflared-exit`) and Cloudflare HTTP status for debugging. No secrets or raw provider errors are displayed. Remote tunnel Healthy may be due to a manual, separately running connector.

## Dashboard-first workflow

- Local dashboard `/tunnel-control`, linked from Cloudflare Setup and the Cloudflare config-import page.
- Start requires: owner pairing, successful Access + dedicated Tunnel metadata (`tunnel-ready` or `published`), saved Remote MCP hostname + matching Access AUD + MCP port 8401, and a RUNNING Remote MCP HTTP service.
- Start calls the official Cloudflare API GET `/accounts/{account_id}/cfd_tunnel/{tunnel_id}` to confirm exact Tunnel ID, then GET `/accounts/{account_id}/cfd_tunnel/{tunnel_id}/token`. Both calls authenticate using the existing Cloudflare User API Token from OS Keychain. It requires `Cloudflare Tunnel Write` or equivalent permission.
- The connector token is never returned to the browser, logged, saved to file, put in CLI arguments, or placed in URLs. It is passed only to child `cloudflared tunnel run` in the child environment variable `TUNNEL_TOKEN`. No `sudo`, `systemd`, or OS boot service is created.
- The process supervisor only manages `cloudflared` child processes that the dashboard itself spawned and sends TERM/KILL only to those processes on Stop. Any pre-existing manually started or OS service `cloudflared` is **never adopted or stopped**. If the user already has the new dedicated Tunnel running manually, stop that manual process with Ctrl+C before starting via dashboard, otherwise multiple replicas may run.
- Dashboard GET/POST API `/api/local/tunnel` requires owner session; POST also requires same-origin mutation guard and accepts only `{ action:"start"|"stop" }`. UI handles Start/Stop/Refresh and reports local managed process state. It does NOT assert remote Tunnel Healthy or OAuth/MCP connection from local process status.
- The child is terminated when this dashboard Node process exits. Restarting the dashboard does NOT automatically restart the connector. Future packaged installer can add an explicit opt-in auto-start policy with safe credential handling and verified process management.

## Safety and remaining work

1. Run `npm run audit:all` and inspect UI in paired/unpaired browsers; test with non-sensitive approved roots.
2. Confirm that `cloudflared` executable is available in the same PATH as the Node dashboard and that previously manual Tunnel replica was stopped.
3. Start MCP HTTP in AI Connections, then visit `/tunnel-control` and click Start Tunnel. Verify Cloudflare dashboard changes to Healthy and DNS CNAME points at correct Tunnel. This requires completing DNS publication before AI Web login.
4. If origin is protected and tunnel healthy, verify Access/OAuth authorization and positive end-to-end Streamable HTTP MCP calls from ChatGPT/Claude. No remote write tools are enabled.

Official references:
- https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/subresources/token/methods/get/
- https://developers.cloudflare.com/tunnel/reference/run-parameters/
