import { OwnerPairingRepository } from "../src/server/owner/index.ts";

// Developer launcher only. A future Windows/macOS/Linux installer will
// invoke the same pairing flow and open the browser itself.
const ticket = await new OwnerPairingRepository().createTicket();
process.stdout.write(
  "Open this URL in your local browser within 2 minutes:\n" +
  "http://127.0.0.1:3100/#owner-pair=" + ticket + "\n" +
  "Do not share the URL; it allows a one-time owner browser session.\n",
);
