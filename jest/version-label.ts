/** What the version chip (src/components/VersionLabel.tsx) shows, part by part. */
import { within } from "@testing-library/react-native";

/** Its texts in order: the commit then "staging" in staging, "v3.0.0" in production. */
export function versionParts(chip: Parameters<typeof within>[0]): string[] {
  return within(chip)
    .getAllByText(/.+/)
    .map((text) => String(text.props.children));
}
