import { bytesToHex } from "@noble/hashes/utils.js";

import { holdMemberEpochs, releaseMemberEpochs } from "@/features/team/export-epochs";
import {
  EXPORT_GRANT_EPOCH_VERSION,
  EXPORT_GRANT_VERSION,
  exportKeysParts,
  parseExportKeysPart,
  type ExportKeys
} from "@/lib/assistant/export-grant";
import { epochReaderFor } from "@/lib/nostr/epochs";
import { nip44Decrypt } from "@/lib/nostr/nip44";
import { EPOCH_ENVELOPE_VERSION, openRecord } from "@/lib/nostr/record";
import { saleRegistry } from "@/lib/registry/registry";
import { MAX_CHANNEL_EPOCHS, parseChannelEpoch, type ChannelEpoch } from "@/lib/team/channel";
import {
  EpochSeeds,
  exportEpochKey,
  exportEpochReader,
  exportEpochSeed
} from "@/lib/team/export-epoch";
import {
  deriveMemberKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  deriveTeamKeys,
  memberSecret,
  ownerDevicesSecret
} from "@/lib/team/keys";
import { profileEvent } from "@/lib/team/member-records";

const team = deriveTeamKeys(new Uint8Array(32).fill(4));
const shared = ownerDevicesSecret(team);
const member = deriveMemberKeys(memberSecret(team, "ab".repeat(16)));
const reader0 = deriveRegistryReader(team).publicKey;

function channelAt(epochs: number[]): ChannelEpoch {
  return {
    epoch: epochs[epochs.length - 1]!,
    epochs: epochs.map((epoch) => {
      const seed = exportEpochSeed(shared, epoch);
      return {
        epoch,
        key: bytesToHex(exportEpochKey(seed, member.records.encryptionKey)),
        reader: exportEpochReader(seed).publicKey
      };
    })
  };
}

describe("an employee channel's export epoch", () => {
  it("is read whole: ascending epochs, the account's last, at most MAX_CHANNEL_EPOCHS", () => {
    const valid = channelAt([1, 2]);
    expect(parseChannelEpoch(valid)).toEqual(valid);
    expect(parseChannelEpoch({ ...valid, epoch: 1 })).toBeNull();
    expect(parseChannelEpoch({ ...valid, epochs: [...valid.epochs].reverse() })).toBeNull();
    expect(parseChannelEpoch({ ...valid, epochs: [] })).toBeNull();
    expect(parseChannelEpoch({ epoch: 0, epochs: [] })).toBeNull();
    expect(
      parseChannelEpoch({
        ...valid,
        epochs: [{ ...valid.epochs[0]!, key: "xyz" }, valid.epochs[1]]
      })
    ).toBeNull();
    const many = Array.from({ length: MAX_CHANNEL_EPOCHS + 1 }, (_, i) => i + 1);
    expect(parseChannelEpoch(channelAt(many))).toBeNull();
    expect(parseChannelEpoch(channelAt(many.slice(1)))).not.toBeNull();
    expect(parseChannelEpoch(null)).toBeNull();
  });

  it("seals the employee's own records at it, as the owner's seeds open them", () => {
    holdMemberEpochs(member.records.encryptionKey, reader0, channelAt([1, 2]));
    const event = profileEvent(member, { version: 1, photo: null, updatedAt: 1790000000 } as never);
    const outside = JSON.parse(
      nip44Decrypt(event.content, member.records.encryptionKey).trim()
    ) as {
      v: { version: number; epoch: number };
    };
    expect(outside.v).toMatchObject({ version: EPOCH_ENVELOPE_VERSION, epoch: 2 });
    const seeds = new EpochSeeds({ shared });
    releaseMemberEpochs();
    const opened = openRecord(event, {
      type: "team-profile",
      encryptionKey: member.records.encryptionKey,
      address: () => true,
      parse: (value) => value,
      epochKey: (epoch) => seeds.keyOf(epoch, member.records.encryptionKey)
    });
    expect(opened?.status).toBe("ok");
  });

  it("seals its sales' declarations for the epoch's reading key, its own registry's only", () => {
    holdMemberEpochs(member.records.encryptionKey, reader0, channelAt([3]));
    const reader = exportEpochReader(exportEpochSeed(shared, 3)).publicKey;
    expect(epochReaderFor(reader0)).toEqual({ epoch: 3, reader });
    expect(epochReaderFor("ab".repeat(32))).toBeNull();
    const sale = saleRegistry(
      { key: deriveRegistryKey(team), reader: reader0, owner: "cd".repeat(32) },
      new Uint8Array(32).fill(1)
    );
    expect(sale.readerEpoch).toEqual({ epoch: 3, reader });
    releaseMemberEpochs();
    expect(epochReaderFor(reader0)).toBeNull();
  });

  it("seals nothing of another family, nor without a channel's epoch", () => {
    holdMemberEpochs(member.records.encryptionKey, reader0, null);
    const event = profileEvent(member, { version: 1, photo: null, updatedAt: 1790000000 } as never);
    const outside = JSON.parse(
      nip44Decrypt(event.content, member.records.encryptionKey).trim()
    ) as {
      v: { version: number };
    };
    expect(outside.v.version).not.toBe(EPOCH_ENVELOPE_VERSION);
  });
});

describe("a grant's keys at an epoch", () => {
  const account = {
    registryReader: "11".repeat(32),
    invoices: {
      author: "22".repeat(32),
      encryptionKey: "33".repeat(32),
      addressKey: "44".repeat(32)
    },
    paymentRates: {
      author: "22".repeat(32),
      encryptionKey: "33".repeat(32),
      addressKey: "44".repeat(32)
    },
    walletSends: {
      author: "22".repeat(32),
      encryptionKey: "33".repeat(32),
      addressKey: "44".repeat(32)
    },
    archive: {
      author: "22".repeat(32),
      encryptionKey: "33".repeat(32),
      addressKey: "44".repeat(32)
    },
    legacyHistory: {
      author: "22".repeat(32),
      encryptionKey: "33".repeat(32),
      addressKey: "44".repeat(32)
    }
  };

  it("are of format 2, naming the epoch and its seed; of format 1 at epoch 0", () => {
    const keys: ExportKeys = {
      account: { ...account, epoch: { epoch: 2, seed: "55".repeat(32) } },
      format: null,
      seats: [],
      omitted: 0
    };
    const [part] = exportKeysParts(keys, 1790000000);
    expect(part).toMatchObject({ version: EXPORT_GRANT_EPOCH_VERSION });
    const value = part!;
    expect(parseExportKeysPart(value, 0)).toEqual(part);
    // Without its epoch, format 2 is no grant.
    expect(parseExportKeysPart({ ...value, account }, 0)).toBeNull();
    const [plain] = exportKeysParts({ ...keys, account }, 1790000000);
    expect(plain).toMatchObject({ version: EXPORT_GRANT_VERSION });
    expect(parseExportKeysPart(plain, 0)?.grantedAt === null).toBe(false);
    // A field of an epoch in format 1 is left aside.
    const read = parseExportKeysPart({ ...plain!, account: keys.account }, 0);
    expect(read?.grantedAt !== null && read?.account?.epoch).toBeUndefined();
  });
});
