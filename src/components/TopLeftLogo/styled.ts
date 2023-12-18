import styled from "styled-components";
import { Image, Pressable } from "@components";

const TOP_LEFT_LOGO_GAP = 26;

export const PressableLogo = styled(Pressable)`
  position: absolute;
  top: ${TOP_LEFT_LOGO_GAP}px;
  left: ${TOP_LEFT_LOGO_GAP}px;
`;

export const TopLeftLogo = styled(Image)`
  height: 24px;
  aspect-ratio: 55/7;
`;
