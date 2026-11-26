import { Text, View } from "react-native";

import { displayVersion, getAppInfo } from "@/lib/app-info";
import { findPasskeyRpId } from "@/lib/breez/config";
import { getBreezStatus } from "@/lib/breez/status";
import { makeStyles, mono, radius, sans, space, type } from "@/theme";

/**
 * What is running (variant, version, commit, OTA update, Breez SDK linkage and network, whether the
 * Breez API key is set, passkey RP ID), so that testers can confirm which build they have.
 * Technical labels, not translated.
 */
export function BuildInfo() {
  const styles = useStyles();
  const info = getAppInfo();
  const breez = getBreezStatus();
  const version = displayVersion(info.version);

  const rows: [label: string, value: string][] = [
    ["Variant", info.variant],
    ["Version", info.buildNumber ? `${version} (${info.buildNumber})` : version],
    ["Commit", info.commit ?? "unknown"],
    ["OTA channel", info.updates ? info.updates.channel || "none" : "disabled"],
    ["OTA update", info.updates ? (info.updates.updateId ?? "embedded bundle") : "—"],
    ["Runtime version", info.updates?.runtimeVersion ?? "—"],
    ["Breez SDK", breez.available ? `loaded (${breez.network})` : `unavailable: ${breez.reason}`],
    ["Breez API key", breez.available ? (breez.apiKeyConfigured ? "set" : "missing") : "—"],
    // Public: the domain of the passkeys, which their system prompt shows anyway.
    ["Passkey RP ID", findPasskeyRpId() ?? "missing"]
  ];

  return (
    <View style={styles.card}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text selectable style={styles.value}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    padding: space[7],
    gap: space[5]
  },
  row: { gap: 2 },
  label: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.secondary },
  value: { ...mono(500), fontSize: type.meta, color: colors.text.primary }
}));
