import "@/i18n";

import { render, screen } from "@testing-library/react-native";

import { HistoryImportLine } from "@/features/migration/HistoryImportLine";
import { formatInteger } from "@/lib/locale/format";

/*
 * The line that follows the copy of the v2 history (HistoryImportLine.tsx): how far it is, the rows
 * read (the v2 server tells no total), then the rows written of every row read. Numbers in the
 * device's locale (en-CH in the tests).
 */

const SBP = "Swiss Bitcoin Pay";

describe("HistoryImportLine", () => {
  it("says the copy started before any row is read", async () => {
    await render(<HistoryImportLine status={{ phase: "running", step: "reading", rows: 0 }} />);
    expect(screen.getByLabelText(`Copying your ${SBP} history in the background…`)).toBeTruthy();
  });

  it("counts the rows read, without a total the v2 server does not tell", async () => {
    await render(<HistoryImportLine status={{ phase: "running", step: "reading", rows: 1 }} />);
    expect(screen.getByLabelText(`Reading your ${SBP} history: 1 movement read…`)).toBeTruthy();

    await render(<HistoryImportLine status={{ phase: "running", step: "reading", rows: 2000 }} />);
    const rows = formatInteger(2000, "en-CH");
    expect(
      screen.getByLabelText(`Reading your ${SBP} history: ${rows} movements read…`)
    ).toBeTruthy();
  });

  it("counts the rows written of every row read, screen readers told too", async () => {
    await render(
      <HistoryImportLine status={{ phase: "running", step: "writing", copied: 300, total: 1451 }} />
    );
    const total = formatInteger(1451, "en-CH");
    const line = screen.getByLabelText(`Copying your ${SBP} history: 300 / ${total} movements…`);
    expect(line.props.accessibilityValue).toEqual({ min: 0, max: 1451, now: 300 });
  });

  it("says nothing more than that it copies a history without any row", async () => {
    await render(
      <HistoryImportLine status={{ phase: "running", step: "writing", copied: 0, total: 0 }} />
    );
    expect(screen.getByLabelText(`Copying your ${SBP} history in the background…`)).toBeTruthy();
  });
});
