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
  [FieldsType.Text]: (props: any) => <TextField {...props} />,
  [FieldsType.Multiline]: (props: any) => (
    <TextField {...props} multiline numberOfLines={3} />
  ),
  [FieldsType.Number]: (props: any) => <TextField inputMode="decimal" {...props} />,
  [FieldsType.Email]: (props: any) => <TextField inputMode="email" {...props} />,
  [FieldsType.Date]: (props: any) => <DateField {...props} />,
  [FieldsType.File]: (props: any) => <FileField {...props} />
};
