import { DateField, FileField, TextField } from "@components";

export enum FieldsType {
  Text = "text",
  Multiline = "multiline",
  Number = "number",
  Email = "email",
  Date = "date",
  File = "file"
}

export const FieldByType = {
  [FieldsType.Text]: (props) => <TextField {...props} />,
  [FieldsType.Multiline]: (props) => (
    <TextField {...props} multiline numberOfLines={3} />
  ),
  [FieldsType.Number]: (props) => <TextField inputMode="decimal" {...props} />,
  [FieldsType.Email]: (props) => <TextField inputMode="email" {...props} />,
  [FieldsType.Date]: (props) => <DateField {...props} />,
  [FieldsType.File]: (props) => <FileField {...props} />
};
