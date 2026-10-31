"use strict";
const SteamUser = require("steam-user");
const AdmZip = require("adm-zip");
const { unzip } = require("steam-user/components/cdn_compression");

test("Steam CDN decompression reads ZIP data through the patched library", async () => {
  const zip = new AdmZip();
  zip.addFile("synthetic.txt", Buffer.from("synthetic steam payload"));
  expect(await unzip(zip.toBuffer())).toEqual(
    Buffer.from("synthetic steam payload"),
  );
});

test("Steam ticket parser preserves ticket fields and rejects unsigned tickets by default", () => {
  const ticket = Buffer.alloc(46);
  ticket.writeUInt32LE(46, 0);
  ticket.writeUInt32LE(4, 4);
  ticket.writeBigUInt64LE(76561198000000000n, 8);
  ticket.writeUInt32LE(730, 16);
  ticket.writeUInt32LE(2000000000, 36);
  expect(SteamUser.parseAppTicket(ticket)).toBeNull();
  const parsed = SteamUser.parseAppTicket(ticket, true);
  expect(parsed.appID).toBe(730);
  expect(parsed.steamID.getSteamID64()).toBe("76561198000000000");
  expect(parsed.hasValidSignature).toBe(false);
});
